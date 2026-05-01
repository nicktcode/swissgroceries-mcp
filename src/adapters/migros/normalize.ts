// Field mapping based on real Migros API responses (captured 2026-04-28):
//
// Product (from getProductDetails, keyed by index):
//   uid (number), migrosId (string), name (string), title (string), versioning (string)
//   offer.price.effectiveValue (number, current price)
//   offer.price.advertisedValue (number, regular/advertised price)
//   offer.quantity (string, e.g. "1l", "500g", "6er") — the size field
//   images[0].url (string)
//   productInformation.mainInformation.brand.name (string)
//   productInformation.mainInformation.labels[].name (string[])
//   breadcrumb[].name (string[])
//   offer.promotion — not present on standard products; promotions come separately
//
// Store (from searchStores, array):
//   storeId (string), storeName (string)
//   location.address (string), location.zip (string), location.city (string)
//   location.latitude (number), location.longitude (number)
//
// Promotions (from getProductPromotionSearch):
//   { items: [{id, type},...], numberOfItems, startDate, endDate }
//   Items are IDs only — full data requires separate product detail calls.

import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveTags } from './tags.js';

function sanitizeRokkaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (url.includes('{') || url.includes('}')) {
    return url.replace(/\{/g, '%7B').replace(/\}/g, '%7D');
  }
  return url;
}

interface MigrosProductRaw {
  uid?: number;
  migrosId?: string;
  name?: string;
  title?: string;
  versioning?: string;
  offer?: {
    price?: {
      effectiveValue?: number;
      advertisedValue?: number;
      unitPrice?: { value?: number; unit?: string };
    };
    // Present only on products currently on promotion. When set, this is
    // the actual checkout price; offer.price is the regular/list price.
    promotionPrice?: {
      effectiveValue?: number;
      advertisedValue?: number;
      unitPrice?: { value?: number; unit?: string };
    };
    // Per-product promotion validity. The promotion-search endpoint also
    // returns a top-level startDate/endDate but those reflect the overall
    // weekly campaign window; per-product dates can differ.
    promotionDateRange?: { startDate?: string; endDate?: string };
    priceInsteadOfLabel?: string; // typically "statt"
    badges?: Array<{ type?: string; description?: string; rawDescription?: string }>;
    quantity?: string;
    isVariableWeight?: boolean;
    promotion?: {
      startsAt?: string;
      endsAt?: string;
      description?: string;
    };
  };
  images?: Array<{ url?: string; cdn?: string }>;
  productUrls?: string;
  productInformation?: {
    mainInformation?: {
      brand?: { name?: string };
      labels?: Array<{ id?: string; name?: string; slug?: string }>;
    };
  };
  breadcrumb?: Array<{ id?: string; name?: string }>;
}

function deriveMigrosPrice(offer: any): { current: number; isApprox: boolean } {
  const ev = offer?.price?.effectiveValue;
  if (typeof ev === 'number' && ev > 0) {
    return { current: ev, isApprox: false };
  }
  const unitPriceVal: number | undefined = offer?.price?.unitPrice?.value;
  const unitPriceUnit: string | undefined = offer?.price?.unitPrice?.unit;
  const qty: string | undefined = offer?.quantity;
  if (typeof unitPriceVal === 'number' && unitPriceVal > 0 && qty) {
    // Parse "1 kg", "500 g", "6er", etc.
    const match = qty.match(/([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk)/i);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toLowerCase();
      // Convert quantity to the unitPrice's reference unit
      // unitPrice.unit is typically '100g' or '100ml' or '1kg' or '1l'
      if (/100\s*g/i.test(unitPriceUnit ?? '') && (unit === 'g' || unit === 'kg')) {
        const grams = unit === 'kg' ? value * 1000 : value;
        return { current: unitPriceVal * (grams / 100), isApprox: true };
      }
      if (/100\s*ml/i.test(unitPriceUnit ?? '') && (unit === 'ml' || unit === 'l' || unit === 'cl' || unit === 'dl')) {
        const ml =
          unit === 'l' ? value * 1000 :
          unit === 'cl' ? value * 10 :
          unit === 'dl' ? value * 100 :
          value;
        return { current: unitPriceVal * (ml / 100), isApprox: true };
      }
      if (/^1\s*kg/i.test(unitPriceUnit ?? '') && (unit === 'g' || unit === 'kg')) {
        const kg = unit === 'kg' ? value : value / 1000;
        return { current: unitPriceVal * kg, isApprox: true };
      }
      if (/^1\s*l/i.test(unitPriceUnit ?? '') && (unit === 'l' || unit === 'ml')) {
        const l = unit === 'l' ? value : value / 1000;
        return { current: unitPriceVal * l, isApprox: true };
      }
    }
  }
  return { current: 0, isApprox: false };
}

const MEASUREMENT_RX = /^([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk|pieces?)\b/i;

export function parseSize(measurement: string | undefined): { value: number; unit: Unit } | undefined {
  if (!measurement) return undefined;
  const m = measurement.match(MEASUREMENT_RX);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unitRaw = m[2].toLowerCase();
  switch (unitRaw) {
    case 'g':  return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l':  return { value, unit: 'l' };
    case 'er':
    case 'stk':
    case 'piece':
    case 'pieces':
      return { value, unit: 'piece' };
  }
  return undefined;
}

export function normalizeProduct(raw: MigrosProductRaw): NormalizedProduct {
  // Real API: id is uid (number) or migrosId (string)
  const id = raw.migrosId ?? String(raw.uid ?? '');
  const name = raw.name ?? '';

  // Migros promotion model:
  //   - On a normal product, offer.price holds the only price.
  //   - On a promo product, offer.promotionPrice is the checkout price
  //     and offer.price is the regular/list price (the "was" amount).
  //     priceInsteadOfLabel: "statt" confirms the relationship.
  // We pick promotionPrice when present; otherwise fall back to deriveMigrosPrice
  // which handles the variable-weight estimation pathway.
  const hasPromoPrice =
    typeof raw.offer?.promotionPrice?.effectiveValue === 'number' &&
    raw.offer.promotionPrice.effectiveValue > 0;

  let current: number;
  let isApprox: boolean;
  let regular: number | undefined;
  if (hasPromoPrice) {
    current = raw.offer!.promotionPrice!.effectiveValue!;
    isApprox = false;
    const reg = raw.offer?.price?.effectiveValue;
    regular = typeof reg === 'number' && reg > current ? reg : undefined;
  } else {
    const derived = deriveMigrosPrice(raw.offer);
    current = derived.current;
    isApprox = derived.isApprox;
    regular = raw.offer?.price?.advertisedValue !== current
      ? raw.offer?.price?.advertisedValue
      : undefined;
  }

  // Quantity string (e.g. "1l", "500g", "6er") is the size
  const size = parseSize(raw.offer?.quantity);
  const labelNames = (raw.productInformation?.mainInformation?.labels ?? [])
    .map((l) => l.name ?? '')
    .filter(Boolean);
  const tags = deriveTags(labelNames, name);
  const category = (raw.breadcrumb ?? []).map((b) => b.name ?? '').filter(Boolean);
  // Migros image URLs come from the rokka CDN with a literal `{stack}`
  // placeholder, e.g. `https://image.migros.ch/d/{stack}/.../slug.jpg`.
  // The CDN accepts the placeholder verbatim and returns the original
  // image, but browsers handle raw `{` / `}` in <img src> inconsistently
  // (some encode them, some don't, and Cloudfront edge nodes occasionally
  // choke). Pre-encoding to %7B / %7D forces a stable path so every
  // consumer of this package gets a browser-safe URL.
  const imageUrl = sanitizeRokkaUrl(raw.images?.[0]?.url);
  // Migros returns the canonical product page URL in raw.productUrls — full
  // URL ready to deep-link from the consumer.
  const productUrl = raw.productUrls;
  const brand = raw.productInformation?.mainInformation?.brand?.name;

  // Build the promotion descriptor. Prefer the per-product promotionDateRange
  // and percentage badge over the older promotion sub-object.
  const pctBadge = (raw.offer?.badges ?? []).find((b) => b.type === 'PERCENTAGE_PROMOTION');
  const dateRangeEnd = raw.offer?.promotionDateRange?.endDate;
  const basePromotion =
    hasPromoPrice || dateRangeEnd || pctBadge ||
    raw.offer?.promotion?.endsAt || raw.offer?.promotion?.description
      ? {
          endsAt: dateRangeEnd ?? raw.offer?.promotion?.endsAt,
          description:
            pctBadge?.description ??
            (raw.offer?.priceInsteadOfLabel && regular !== undefined
              ? `${raw.offer.priceInsteadOfLabel} CHF ${regular.toFixed(2)}`
              : raw.offer?.promotion?.description),
        }
      : undefined;

  const product: NormalizedProduct = {
    chain: 'migros',
    id,
    name,
    brand,
    size,
    price: { current, regular, currency: 'CHF' },
    category,
    tags,
    imageUrl,
    productUrl,
    promotion: basePromotion,
    raw,
  };
  // If approx, mark via promotion description so the LLM can communicate
  if (isApprox && current > 0) {
    product.promotion = {
      ...product.promotion,
      description: (product.promotion?.description ?? '') + ' (estimated price for variable-weight item)',
    };
  }
  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

interface MigrosStoreRaw {
  storeId?: string;
  storeName?: string;
  location?: {
    address?: string;
    zip?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
}

export function normalizeStore(raw: MigrosStoreRaw): NormalizedStore {
  return {
    chain: 'migros',
    id: raw.storeId ?? '',
    name: raw.storeName ?? '',
    address: {
      street: raw.location?.address ?? '',
      zip: raw.location?.zip ?? '',
      city: raw.location?.city ?? '',
    },
    location: {
      lat: raw.location?.latitude ?? 0,
      lng: raw.location?.longitude ?? 0,
    },
  };
}

interface MigrosPromotionRaw {
  // Full-product variant (when promotion comes from product details)
  uid?: string;
  migrosId?: string;
  name?: string;
  offer?: { price?: { effectiveValue?: number; advertisedValue?: number } };
  promotion?: { startsAt?: string; endsAt?: string; description?: string };

  // Promotion-stub variant (when from getProductPromotionSearch)
  id?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  price?: { value?: number; original?: number }; // legacy fallback
  validFrom?: string;
  validUntil?: string;
}

// Promotions from getProductPromotionSearch return item IDs only (not full product data).
// { items: [{id, type},...], numberOfItems, startDate, endDate }
// We expose them as lightweight stubs; callers needing full detail should call getProduct().
export function normalizePromotion(raw: MigrosPromotionRaw): NormalizedPromotion {
  // Full product promotion (if fetched via product detail, has offer.promotion)
  if (raw.uid !== undefined || raw.migrosId !== undefined) {
    return {
      chain: 'migros',
      productId: raw.migrosId ?? String(raw.uid ?? ''),
      productName: raw.name ?? '',
      price: raw.offer?.price?.effectiveValue !== undefined
        ? { current: raw.offer.price.effectiveValue, regular: raw.offer.price.advertisedValue, currency: 'CHF' }
        : undefined,
      validFrom: raw.promotion?.startsAt ?? raw.validFrom,
      validUntil: raw.promotion?.endsAt ?? raw.validUntil,
      description: raw.promotion?.description ?? raw.description,
    };
  }
  // Promotion search item stub (only id/type)
  return {
    chain: 'migros',
    productId: String(raw.id ?? ''),
    productName: '',
    validFrom: raw.startDate,
    validUntil: raw.endDate,
    description: raw.type,
  };
}
