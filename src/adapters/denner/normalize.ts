import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveDennerTags } from './tags.js';

const SIZE_RX = /([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk)/i;

export function parseSize(text: string | undefined): { value: number; unit: Unit } | undefined {
  if (!text) return undefined;
  const m = text.match(SIZE_RX);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  switch (m[2].toLowerCase()) {
    case 'g': return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l': return { value, unit: 'l' };
    case 'er':
    case 'stk':
      return { value, unit: 'piece' };
  }
  return undefined;
}

// Actual API shape from app-api.denner.ch/api/m/content/v2
interface DennerProductRaw {
  id?: string | number;
  title?: { de?: string; fr?: string; it?: string } | string;
  description?: { de?: string; fr?: string; it?: string } | string;
  imageUrl?: string;
  priceDiscount?: number;   // current price in CHF (e.g. 8.80)
  priceOrigin?: number;     // regular/original price in CHF
  priceOverride?: number | null;
  ecoLabels?: string[];
  validFrom?: string;
  validTo?: string;
  publicationId?: string;
  groupIds?: string[];
  [key: string]: unknown;
}

export function normalizeProduct(raw: DennerProductRaw): NormalizedProduct {
  const id = String(raw.id ?? '');
  // title is a multilingual object; fall back through languages
  const name = typeof raw.title === 'string'
    ? raw.title
    : (raw.title?.de ?? raw.title?.fr ?? raw.title?.it ?? '');
  // description contains size info (e.g. "250 g", "6 x 75 cl")
  const descText = typeof raw.description === 'string'
    ? raw.description
    : (raw.description?.de ?? raw.description?.fr ?? raw.description?.it ?? '');
  const size = parseSize(descText);
  const current = raw.priceOverride ?? raw.priceDiscount ?? 0;
  const regular = raw.priceOrigin && raw.priceOrigin > 0 ? raw.priceOrigin : undefined;
  // Denner's canonical URL is /de/aktionen/<slug>~p<numericId>?variant=<uuid>.
  // The numeric `p` ID isn't exposed in the API response, but the variant
  // UUID alone is enough — denner.ch resolves and 302-redirects to the
  // canonical URL when given a placeholder slug+id with the right variant
  // (verified live: HTTP 200 redirect-chain on `/de/aktionen/x~p1?variant=`).
  const productUrl = id
    ? `https://www.denner.ch/de/aktionen/x~p1?variant=${id}`
    : undefined;
  const product: NormalizedProduct = {
    chain: 'denner',
    id,
    name,
    size,
    price: { current, regular, currency: 'CHF' },
    tags: deriveDennerTags(name, raw.ecoLabels),
    imageUrl: raw.imageUrl,
    productUrl,
    promotion: (raw.validFrom || raw.validTo)
      ? { endsAt: raw.validTo, description: descText || undefined }
      : undefined,
    raw,
  };
  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

// Actual API shape from app-api.denner.ch/api/m/stores
interface DennerStoreRaw {
  id?: string | number;
  type?: { de?: string; fr?: string; it?: string } | string;
  address?: {
    street?: string;
    zipCode?: string;
    city?: string;
    [key: string]: unknown;
  };
  coord?: { lat?: number; lng?: number };
  [key: string]: unknown;
}

export function normalizeStore(raw: DennerStoreRaw): NormalizedStore {
  const storeName = typeof raw.type === 'string'
    ? raw.type
    : (raw.type?.de ?? raw.type?.fr ?? raw.type?.it ?? 'Denner');
  const addr = raw.address ?? {};
  return {
    chain: 'denner',
    id: String(raw.id ?? ''),
    name: storeName,
    address: {
      street: addr.street ?? '',
      zip: addr.zipCode ?? '',
      city: addr.city ?? '',
    },
    location: {
      lat: raw.coord?.lat ?? 0,
      lng: raw.coord?.lng ?? 0,
    },
  };
}

// Promotions are derived from individual products (not publications).
// Products carry their own validFrom/validTo and full title/price data.
interface DennerPromotionRaw {
  id?: string | number;
  title?: { de?: string; fr?: string; it?: string } | string;
  description?: { de?: string; fr?: string; it?: string } | string;
  priceDiscount?: number;
  priceOrigin?: number;
  priceOverride?: number | null;
  validFrom?: string;
  validTo?: string;
  [key: string]: unknown;
}

export function normalizePromotion(raw: DennerPromotionRaw): NormalizedPromotion {
  const productName = typeof raw.title === 'string'
    ? raw.title
    : (raw.title?.de ?? raw.title?.fr ?? raw.title?.it ?? '');
  const descText = typeof raw.description === 'string'
    ? raw.description
    : (raw.description?.de ?? raw.description?.fr ?? raw.description?.it ?? '');
  const current = raw.priceOverride ?? raw.priceDiscount;
  const regular = raw.priceOrigin && raw.priceOrigin > 0 ? raw.priceOrigin : undefined;
  return {
    chain: 'denner',
    productId: raw.id !== undefined ? String(raw.id) : undefined,
    productName,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
    price: current !== undefined
      ? { current, regular, currency: 'CHF' }
      : undefined,
    validFrom: raw.validFrom,
    validUntil: raw.validTo,
    description: descText || undefined,
  };
}
