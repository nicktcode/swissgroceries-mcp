import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveLidlTags } from './tags.js';

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

// Real Lidl API uses mainPrice.price / mainPrice.oldPrice (not price.price)
// Products in the campaign list don't have weight or validFrom/validUntil fields.
// Size is parsed from subtitle or additionalInfo if present.
interface LidlMainPrice {
  price?: number;
  oldPrice?: number;
  symbol?: string;
}

interface LidlProductRaw {
  id?: string;
  title?: string;
  subtitle?: string;
  brand?: string;
  // Campaign-list products use mainPrice, not price
  mainPrice?: LidlMainPrice;
  // Legacy / plan draft field — not present in real fixtures
  price?: { price?: number; oldPrice?: number; currency?: string };
  // Product detail uses imageUrls (array); campaign list uses imageUrl (string)
  imageUrl?: string;
  imageUrls?: string[];
  additionalInfo?: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
}

export function normalizeProduct(raw: LidlProductRaw): NormalizedProduct {
  const name = raw.title ?? '';

  // Size: try subtitle first, then additionalInfo, then description
  const sizeText = raw.subtitle || raw.additionalInfo || raw.description;
  const size = parseSize(sizeText);

  // Price: real API uses mainPrice block; fall back to plan-draft price block
  const current = raw.mainPrice?.price ?? raw.price?.price ?? 0;
  const regular = raw.mainPrice?.oldPrice ?? raw.price?.oldPrice;

  const p: NormalizedProduct = {
    chain: 'lidl',
    id: raw.id ?? '',
    name,
    brand: raw.brand || undefined,
    size,
    price: { current, regular, currency: 'CHF' },
    tags: deriveLidlTags(name),
    imageUrl: raw.imageUrl ?? raw.imageUrls?.[0],
    promotion: raw.validUntil ? { endsAt: raw.validUntil } : undefined,
    raw,
  };
  p.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(p);
  return p;
}

// Real Lidl store API (v2/CH) uses storeKey, locality, postalCode, address (flat)
// and location.latitude / location.longitude (not coordinates)
interface LidlStoreRaw {
  // v2/CH store format
  storeKey?: string;
  name?: string;
  address?: string;
  postalCode?: string;
  locality?: string;
  location?: { latitude?: number; longitude?: number };
  // Alternative nested address format (from plan draft — not present in real fixtures)
  id?: string;
  coordinates?: { latitude?: number; longitude?: number };
}

export function normalizeStore(raw: LidlStoreRaw): NormalizedStore {
  const lat = raw.location?.latitude ?? raw.coordinates?.latitude ?? 0;
  const lng = raw.location?.longitude ?? raw.coordinates?.longitude ?? 0;
  const id = raw.storeKey ?? raw.id ?? '';
  // address may be a flat string (v2/CH) or nested object (plan draft)
  const street = typeof raw.address === 'string' ? raw.address : (raw.address as any)?.street ?? '';
  return {
    chain: 'lidl',
    id,
    name: raw.name ?? '',
    address: {
      street,
      zip: raw.postalCode ?? (raw.address as any)?.zipCode ?? '',
      city: raw.locality ?? (raw.address as any)?.city ?? '',
    },
    location: { lat, lng },
  };
}

interface LidlPromotionRaw {
  id?: string;
  title?: string;
  imageUrl?: string;
  mainPrice?: LidlMainPrice;
  price?: { price?: number; oldPrice?: number };
  validFrom?: string;
  validUntil?: string;
  description?: string;
}

export function normalizePromotion(raw: LidlPromotionRaw): NormalizedPromotion {
  const current = raw.mainPrice?.price ?? raw.price?.price;
  const regular = raw.mainPrice?.oldPrice ?? raw.price?.oldPrice;
  return {
    chain: 'lidl',
    productId: raw.id,
    productName: raw.title ?? '',
    imageUrl: raw.imageUrl,
    price: current !== undefined
      ? { current, regular, currency: 'CHF' }
      : undefined,
    validFrom: raw.validFrom,
    validUntil: raw.validUntil,
    description: raw.description,
  };
}
