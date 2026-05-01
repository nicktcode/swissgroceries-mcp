import type { NormalizedProduct, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveFarmyTags } from './tags.js';

// Farmy /api/products shape (verified live 2026-04-29):
//   - id: number
//   - name: e.g. "Bio Laugenbrezeli mit Kernen, 100g"
//   - sku: string
//   - display_price: string ("3.20"); price: number (3.2)
//   - strikeout_price: nullable string — present when item is on sale
//   - price_per_100g: nullable string/number — pre-computed; only meaningful for weight-based items
//   - packaging / unit_name: descriptive ("Stück", "100g", "1l")
//   - image: { xs, md, preview, large_url? }
//   - certificates: [{ id, code: "ch_bio", name: "CH-BIO" }]
//   - categories: [{ name, permalink, depth }]
//   - producer: { name } — used as brand
//   - seo_url: relative URL slug

const SIZE_RX = /([\d.,]+)\s*(kg|g|ml|cl|dl|l)\b/i;
const COUNT_RX = /(\d+)\s*(?:x|stk|stück|pack|pieces?)/i;

export function parseFarmySize(text: string | undefined): { value: number; unit: Unit } | undefined {
  if (!text) return undefined;
  const m = text.match(SIZE_RX);
  if (!m) {
    const c = text.match(COUNT_RX);
    if (c) {
      const v = parseFloat(c[1]);
      if (Number.isFinite(v) && v > 0) return { value: v, unit: 'piece' };
    }
    return undefined;
  }
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  switch (m[2].toLowerCase()) {
    case 'g':  return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l':  return { value, unit: 'l' };
  }
  return undefined;
}

interface FarmyImage {
  xs?: string;
  md?: string;
  preview?: string;
  large_url?: string;
  medium_url?: string;
  url?: string;
}

interface FarmyCertificate {
  name?: string;
  code?: string;
}

interface FarmyCategory {
  name?: string;
}

interface FarmyProducer {
  name?: string;
}

export interface FarmyProductRaw {
  id?: number | string;
  name?: string;
  sku?: string;
  description?: string | null;
  display_price?: string | number;
  price?: string | number;
  strikeout_price?: string | number | null;
  price_per_100g?: string | number | null;
  packaging?: string | null;
  unit_name?: string | null;
  seo_url?: string | null;
  image?: FarmyImage | string | null;
  certificates?: FarmyCertificate[];
  filter_certificates?: FarmyCertificate[];
  categories?: FarmyCategory[];
  producer?: FarmyProducer | null;
  supplier?: { name?: string } | null;
  ribbon_data?: unknown;
}

function toNumber(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function pickImageUrl(img: FarmyImage | string | null | undefined): string | undefined {
  if (!img) return undefined;
  if (typeof img === 'string') return img;
  return img.md ?? img.large_url ?? img.medium_url ?? img.preview ?? img.url ?? img.xs;
}

export function normalizeProduct(raw: FarmyProductRaw): NormalizedProduct {
  const name = raw.name ?? '';

  // Try size from packaging first, then unit_name, then product name (",100g" suffix common)
  const size =
    parseFarmySize(raw.packaging ?? undefined) ??
    parseFarmySize(raw.unit_name ?? undefined) ??
    parseFarmySize(name);

  const current = toNumber(raw.price) ?? toNumber(raw.display_price) ?? 0;
  const regular = toNumber(raw.strikeout_price ?? undefined);

  const certNames = (raw.certificates ?? []).map((c) => c.name ?? c.code ?? '').filter(Boolean);
  const certCodes = (raw.certificates ?? []).map((c) => c.code ?? '').filter(Boolean);
  const categoryNames = (raw.categories ?? []).map((c) => c.name ?? '').filter(Boolean);

  const promotion = regular !== undefined && regular > current
    ? { description: `Reduziert von CHF ${regular.toFixed(2)}` }
    : undefined;

  const product: NormalizedProduct = {
    chain: 'farmy',
    id: String(raw.id ?? raw.sku ?? ''),
    name,
    brand: raw.producer?.name || raw.supplier?.name || undefined,
    size,
    price: {
      current,
      regular: regular !== undefined && regular > current ? regular : undefined,
      currency: 'CHF',
    },
    tags: deriveFarmyTags(name, [...certNames, ...certCodes], categoryNames),
    category: categoryNames.length ? categoryNames : undefined,
    imageUrl: pickImageUrl(raw.image),
    // Farmy returns the SEO slug path; prepend the canonical host + locale.
    productUrl: typeof (raw as { seo_url?: unknown }).seo_url === 'string'
      ? `https://www.farmy.ch/de${(raw as { seo_url: string }).seo_url}`
      : undefined,
    promotion,
    raw,
  };

  // Prefer the API-provided per-100g price when available; otherwise derive from size.
  const per100g = toNumber(raw.price_per_100g ?? undefined);
  if (per100g !== undefined && per100g > 0 && size && (size.unit === 'g' || size.unit === 'kg')) {
    product.unitPrice = { value: per100g * 10, per: 'kg' }; // CHF / 100g → CHF / kg
  } else {
    product.unitPrice = computeUnitPrice(current, size);
  }

  annotateMultipack(product);
  return product;
}

export function normalizePromotion(raw: FarmyProductRaw): NormalizedPromotion {
  const current = toNumber(raw.price) ?? toNumber(raw.display_price);
  const regular = toNumber(raw.strikeout_price ?? undefined);
  return {
    chain: 'farmy',
    productId: String(raw.id ?? raw.sku ?? ''),
    productName: raw.name ?? '',
    price: current !== undefined
      ? { current, regular: regular !== undefined && regular > current ? regular : undefined, currency: 'CHF' }
      : undefined,
    description: regular !== undefined && current !== undefined && regular > current
      ? `Reduziert von CHF ${regular.toFixed(2)}`
      : undefined,
  };
}
