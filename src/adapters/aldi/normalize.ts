import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveAldiTags } from './tags.js';

// Actual Aldi API shape (verified against live fixtures 2026-04-28)
// Key divergences from plan's drafts:
//   - Top-level key is `data`, not `products` or `results`
//   - Product id field: `sku`, not `articleId`
//   - Brand field: `brandName`, not `brand`
//   - Price: `price.amount` (integer in CHF rappen, e.g. 185 = CHF 1.85), not `price.current` (float)
//   - No separate `price.regular`; was-price in `price.wasPriceDisplay` (string) only
//   - Size: `sellingSize` (e.g. "1 l", "0.8 kg"), not `size` field
//   - Categories: `categories` is an array of `{id, name, urlSlugText}`, not `category.name`
//   - Image: `assets[].url`, not `imageUrls[]`; URL contains `{width}` and `{slug}` placeholders
//   - No `labels` array; badges array has `{position, items[{displayText}]}` for marketing info
//   - No promotion sub-object; `price.wasPriceDisplay` signals discount when non-null
//   - Store shape from /v2/service-points (not /v3/stores):
//     - id: `id` (e.g. "E220"), not `servicePoint`
//     - lat/lng: inside `address.latitude` / `address.longitude` (string), not `location.*`
//     - street: `address.address1`, not `address.street`
//     - zip: `address.zipCode`, not `address.zip`
//     - city: `address.city`

const SIZE_RX = /([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk|x)/i;

export function parseSize(text: string | undefined): { value: number; unit: Unit } | undefined {
  if (!text) return undefined;
  const m = text.match(SIZE_RX);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  switch (m[2].toLowerCase()) {
    case 'g':  return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l':  return { value, unit: 'l' };
    case 'er':
    case 'stk':
    case 'x':
      return { value, unit: 'piece' };
  }
  return undefined;
}

interface AldiAsset {
  url?: string;
  assetType?: string;
}

interface AldiCategory {
  id?: string;
  name?: string;
  urlSlugText?: string;
}

interface AldiBadgeItem {
  displayText?: string;
  color?: string;
}

interface AldiBadge {
  position?: string;
  items?: AldiBadgeItem[];
}

interface AldiPrice {
  // Amount in rappen (integer), e.g. 185 = CHF 1.85
  amount?: number;
  amountRelevant?: number;
  wasPriceDisplay?: string | null;
  currencyCode?: string;
  comparison?: number | null;
  comparisonDisplay?: string | null;
}

interface AldiProductRaw {
  sku?: string;
  name?: string;
  brandName?: string;
  sellingSize?: string;           // e.g. "1 l", "0.8 kg", "6x33cl"
  description?: string;
  price?: AldiPrice;
  categories?: AldiCategory[];
  assets?: AldiAsset[];
  badges?: AldiBadge[];
  onSaleDateDisplay?: string | null;
}

export function normalizeProduct(raw: AldiProductRaw): NormalizedProduct {
  const name = raw.name ?? '';

  // Size comes from sellingSize (e.g. "1 l", "0.8 kg")
  const size = parseSize(raw.sellingSize ?? raw.description);

  // Price is in rappen; divide by 100 to get CHF
  const current = raw.price?.amount !== undefined ? raw.price.amount / 100 : 0;

  // Collect badge display texts for tag derivation
  const badgeTexts = (raw.badges ?? []).flatMap(
    (b) => (b.items ?? []).map((i) => i.displayText ?? ''),
  );

  // Category: use last (most specific) category name
  const categoryNames = (raw.categories ?? []).map((c) => c.name ?? '').filter(Boolean);

  // Image URL from assets; replace placeholders with sensible defaults
  const rawImageUrl = raw.assets?.[0]?.url;
  const imageUrl = rawImageUrl
    ? rawImageUrl.replace('{width}', '400').replace('{slug}', raw.sku ?? '')
    : undefined;

  // Promotion: signaled by non-null wasPriceDisplay
  const promotion = raw.price?.wasPriceDisplay
    ? { description: `Was: ${raw.price.wasPriceDisplay}` }
    : undefined;

  const product: NormalizedProduct = {
    chain: 'aldi',
    id: raw.sku ?? '',
    name,
    brand: raw.brandName || undefined,
    size,
    price: { current, currency: 'CHF' },
    tags: deriveAldiTags(name, badgeTexts),
    category: categoryNames.length ? categoryNames : undefined,
    imageUrl,
    promotion,
    raw,
  };
  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

interface AldiStoreAddress {
  address1?: string;
  city?: string;
  zipCode?: string;
  latitude?: string | number;
  longitude?: string | number;
}

interface AldiStoreRaw {
  id?: string;
  name?: string;
  address?: AldiStoreAddress;
}

export function normalizeStore(raw: AldiStoreRaw): NormalizedStore {
  return {
    chain: 'aldi',
    id: raw.id ?? '',
    name: raw.name ?? '',
    address: {
      street: raw.address?.address1 ?? '',
      zip: raw.address?.zipCode ?? '',
      city: raw.address?.city ?? '',
    },
    location: {
      lat: parseFloat(String(raw.address?.latitude ?? '0')) || 0,
      lng: parseFloat(String(raw.address?.longitude ?? '0')) || 0,
    },
  };
}

interface AldiPromotionRaw {
  sku?: string;
  name?: string;
  price?: AldiPrice;
  onSaleDateDisplay?: string | null;
}

export function normalizePromotion(raw: AldiPromotionRaw): NormalizedPromotion {
  const current = raw.price?.amount !== undefined ? raw.price.amount / 100 : undefined;
  return {
    chain: 'aldi',
    productId: raw.sku,
    productName: raw.name ?? '',
    price: current !== undefined
      ? { current, currency: 'CHF' }
      : undefined,
    validUntil: raw.onSaleDateDisplay ?? undefined,
    description: raw.price?.wasPriceDisplay
      ? `Was: ${raw.price.wasPriceDisplay}`
      : undefined,
  };
}
