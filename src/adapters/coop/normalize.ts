import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { sizeFromName } from '../../util/size-from-name.js';
import { deriveCoopTags } from './tags.js';

// 'ST' is Coop's contentUnit abbreviation for Stück (e.g. egg cartons).
// Without it, content='10' + contentUnit='ST' parses as a no-match and
// piece-priced products get no size + no unit price — they then sort to
// the bottom of any per-unit ranking.
const SIZE_RX = /([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk|stück|stueck|st)/i;

export function parseSize(text: string | undefined): { value: number; unit: Unit } | undefined {
  if (!text) return undefined;
  const m = text.match(SIZE_RX);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const u = m[2].toLowerCase();
  switch (u) {
    case 'g':  return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l':  return { value, unit: 'l' };
    case 'er':
    case 'st':
    case 'stk':
    case 'stück':
    case 'stueck':
      return { value, unit: 'piece' };
  }
  return undefined;
}

// Actual Coop Hybris API shape (verified against live fixture 2026-04-28)
// Key divergences from original plan:
//   - brand: not present; supplier array exists but isn't a brand
//   - oldPrice: not present; originalPrice holds pre-discount price
//   - unit/measurement/packageSize: not present; size is in content + contentUnit
//   - promotionEndDate: not present; promotion signaled by hasPromotion/weekPromotion booleans
//   - categories: not present; primaryCategory holds a single {id, name} object
//   - productPicture: not present; images[] array used instead
//   - labels: present but typically empty; boolean flags (vegan, glutenFree, etc.) are reliable
interface HybrisProduct {
  code?: string;
  name?: string;
  // No top-level brand field; supplier is a contact info array
  price?: { value?: number; formattedValue?: string };
  originalPrice?: { value?: number };   // replaces oldPrice
  content?: string;                      // size amount (e.g. "500")
  contentUnit?: string;                  // size unit (e.g. "g", "ml")
  images?: Array<{ url?: string; usedFor?: string }>;
  primaryCategory?: { id?: string; name?: string }; // replaces categories[]
  // Slash-separated breadcrumb-ish path used in canonical product URLs.
  // Example: "lebensmittel/milchprodukte-eier/milch/multipacks-ab-1l".
  categoryPathForTracking?: string;
  labels?: string[];
  hasPromotion?: boolean;
  weekPromotion?: boolean;
  discountPercentage?: number;
  selectedPromotion?: { text?: string };
  // Boolean dietary/attribute flags
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  lactoseFree?: boolean;
  regionalProduct?: boolean;
}

export function normalizeProduct(raw: HybrisProduct & { title?: string; fullName?: string; productName?: string }): NormalizedProduct {
  const name = (raw as any).title ?? raw.name ?? (raw as any).fullName ?? (raw as any).productName ?? '';
  // Build size from content + contentUnit (e.g. "500" + "g"). When that's
  // missing or unparseable, fall back to extracting from the human-readable
  // name (which often carries something like "10 Stück" or "1.5l" inline).
  const sizeText = raw.content && raw.contentUnit
    ? `${raw.content}${raw.contentUnit}`
    : undefined;
  const size = parseSize(sizeText) ?? sizeFromName(name);
  const tags = deriveCoopTags(raw.labels ?? [], name, {
    vegan: raw.vegan,
    vegetarian: raw.vegetarian,
    glutenFree: raw.glutenFree,
    lactoseFree: raw.lactoseFree,
    regionalProduct: raw.regionalProduct,
  });
  const current = raw.price?.value ?? 0;
  // originalPrice holds the pre-discount price (replaces oldPrice in the plan)
  const regular = raw.originalPrice?.value;
  const category = raw.primaryCategory?.name
    ? [raw.primaryCategory.name]
    : undefined;
  // Use first image from images array
  const imageUrl = raw.images?.[0]?.url;
  // Promotion: Coop signals via boolean flags; no promotionEndDate field in API
  const promotion = raw.hasPromotion
    ? { description: raw.selectedPromotion?.text }
    : undefined;

  // Coop runs SAP Commerce Cloud; the canonical product URL is the
  // categoryPathForTracking slug + the product code:
  //   /de/<categoryPath>/p/<code>
  // E.g. /de/lebensmittel/milchprodukte-eier/milch/multipacks-ab-1l/p/4389992.
  // Coop's edge is on Cloudflare with aggressive bot protection so we can't
  // verify the URL from a headless probe (always 403), but the pattern
  // matches every Coop product link we've seen on coop.ch and aligns with
  // the SAP Commerce default. Real browsers (with cookies + JS UA) follow
  // it correctly. If categoryPathForTracking is missing the URL is
  // skipped — partial paths render the wrong page.
  const code = raw.code;
  const categoryPath = raw.categoryPathForTracking;
  const productUrl =
    code && categoryPath
      ? `https://www.coop.ch/de/${categoryPath.replace(/^\/+|\/+$/g, '')}/p/${code}`
      : undefined;

  const product: NormalizedProduct = {
    chain: 'coop',
    id: code ?? '',
    name,
    size,
    price: { current, regular, currency: 'CHF' },
    tags,
    category,
    imageUrl,
    productUrl,
    promotion,
    raw,
  };
  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

// Actual Coop store shape (verified against live fixture 2026-04-28)
// Key divergences: storeIdentifier not present; vstId is the store ID
// geoPoint is top-level (not nested in address); address has no lat/lng
interface CoopStoreRaw {
  vstId?: string;
  name?: string;
  displayName?: string;
  address?: { line1?: string; line2?: string; postalCode?: string; town?: string };
  geoPoint?: { latitude?: number; longitude?: number };
}

export function normalizeStore(raw: CoopStoreRaw): NormalizedStore {
  const street = [raw.address?.line1, raw.address?.line2].filter(Boolean).join(' ');
  return {
    chain: 'coop',
    id: raw.vstId ?? '',
    name: raw.displayName ?? raw.name ?? '',
    address: {
      street,
      zip: raw.address?.postalCode ?? '',
      city: raw.address?.town ?? '',
    },
    location: {
      lat: raw.geoPoint?.latitude ?? 0,
      lng: raw.geoPoint?.longitude ?? 0,
    },
  };
}

// Coop promotions endpoint returns near-empty response in practice.
// This shape is speculative for future compatibility.
interface CoopPromotionRaw {
  code?: string;
  name?: string;
  title?: string;
  price?: { value?: number };
  oldPrice?: { value?: number };
  originalPrice?: { value?: number };
  startDate?: string;
  endDate?: string;
  promotionEndDate?: string;
  description?: string;
}

export function normalizePromotion(raw: CoopPromotionRaw): NormalizedPromotion {
  const regular = raw.oldPrice?.value ?? raw.originalPrice?.value;
  return {
    chain: 'coop',
    productId: raw.code,
    productName: raw.name ?? raw.title ?? '',
    price: raw.price?.value !== undefined
      ? { current: raw.price.value, regular, currency: 'CHF' }
      : undefined,
    validFrom: raw.startDate,
    validUntil: raw.endDate ?? raw.promotionEndDate,
    description: raw.description,
  };
}
