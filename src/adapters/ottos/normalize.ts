import type { NormalizedProduct, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveOttosTags } from './tags.js';

// Otto's SAP Commerce OCC v2 product shape (verified live 2026-04-29):
//   - code: string product ID (e.g. "446845")
//   - name: HTML-highlighted ("<em class=...>milch</em>") — strip on normalize
//   - description: HTML
//   - brand: string
//   - price: { value, currencyIso, formattedValue, priceType: "BUY" }
//   - insteadOfPrice: nullable; populated when on promotion (was-price)
//   - basePrice: nullable; OCC unit price (rare in food category)
//   - categories: breadcrumb array of { code, name, url, excludeFromProductBreadcrumb }
//   - images: array of { url: "/medias/..." (relative), format, imageType, galleryIndex }
//   - stock: { stockLevelStatus: "inStock" | "lowStock" | "outOfStock" }
//   - unitName: nullable
//
// Otto's spans non-grocery items (clothing, furniture). The adapter filters
// out products whose category breadcrumb does not contain at least one of the
// roots in OTTOS_GROCERY_ROOTS — so cross-comparison with Migros/Coop only
// sees food, drugstore, baby goods.

export const OTTOS_GROCERY_ROOTS = new Set([
  'm_10000',  // Supermarkt & Weine (food, household basics, wine)
  'm_20000',  // Beauty & Gesundheit (drugstore: körperpflege, parfum, haarpflege)
  'm_30000',  // Baby & Kinder (windeln, babynahrung)
]);

const HTML_RX = /<[^>]+>/g;
const SIZE_RX = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i;
const COUNT_X_SIZE_RX = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i;
const IMAGE_BASE = 'https://www.ottos.ch';

interface ParsedSize { value: number; unit: Unit }

function unitFromText(numText: string, unitText: string): ParsedSize | undefined {
  const v = parseFloat(numText.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return undefined;
  switch (unitText.toLowerCase()) {
    case 'g':  return { value: v, unit: 'g' };
    case 'kg': return { value: v, unit: 'kg' };
    case 'ml': return { value: v, unit: 'ml' };
    case 'cl': return { value: v * 10, unit: 'ml' };
    case 'dl': return { value: v * 100, unit: 'ml' };
    case 'l':  return { value: v, unit: 'l' };
  }
  return undefined;
}

export function parseOttosSize(text: string | undefined): ParsedSize | undefined {
  if (!text) return undefined;
  const cm = text.match(COUNT_X_SIZE_RX);
  if (cm) {
    const count = parseFloat(cm[1]);
    const unit = unitFromText(cm[2], cm[3]);
    if (unit && Number.isFinite(count) && count > 0) {
      return { value: unit.value * count, unit: unit.unit };
    }
  }
  const m = text.match(SIZE_RX);
  if (m) return unitFromText(m[1], m[2]);
  return undefined;
}

export function stripHighlight(s: string | undefined): string {
  if (!s) return '';
  return s.replace(HTML_RX, '').replace(/\s+/g, ' ').trim();
}

interface OttosPriceRaw {
  value?: number;
  currencyIso?: string;
  formattedValue?: string;
  priceType?: string;
}

interface OttosCategoryRaw {
  code?: string;
  name?: string;
  url?: string;
  excludeFromProductBreadcrumb?: boolean;
}

interface OttosImageRaw {
  url?: string;
  format?: string;
  imageType?: string;
  galleryIndex?: number;
}

interface OttosStockRaw {
  stockLevelStatus?: string;
  stockLevel?: number;
}

export interface OttosProductRaw {
  code?: string;
  name?: string;
  description?: string;
  brand?: string;
  url?: string;
  categories?: OttosCategoryRaw[];
  price?: OttosPriceRaw;
  insteadOfPrice?: OttosPriceRaw | null;
  basePrice?: OttosPriceRaw | null;
  images?: OttosImageRaw[];
  stock?: OttosStockRaw;
  unitName?: string | null;
  productLabels?: string[] | null;
  purchasable?: boolean;
}

export function isGroceryProduct(p: OttosProductRaw): boolean {
  for (const c of p.categories ?? []) {
    if (c.code && OTTOS_GROCERY_ROOTS.has(c.code)) return true;
  }
  return false;
}

function pickPrimaryImage(images: OttosImageRaw[] | undefined): string | undefined {
  if (!images || images.length === 0) return undefined;
  const primary = images.find((i) => i.imageType === 'PRIMARY' && i.format === 'product-main');
  const chosen = primary ?? images[0];
  if (!chosen.url) return undefined;
  return chosen.url.startsWith('http') ? chosen.url : IMAGE_BASE + chosen.url;
}

export function normalizeProduct(raw: OttosProductRaw): NormalizedProduct {
  const name = stripHighlight(raw.name);
  const current = raw.price?.value ?? 0;
  const regular = raw.insteadOfPrice?.value;

  const size = parseOttosSize(raw.unitName ?? undefined) ?? parseOttosSize(name);

  const categoryNames = (raw.categories ?? [])
    .filter((c) => !c.excludeFromProductBreadcrumb)
    .map((c) => c.name ?? '')
    .filter(Boolean);

  const labels = raw.productLabels ?? [];

  const onSale = regular !== undefined && regular > current;
  const promotion = onSale && regular !== undefined
    ? { description: `Statt CHF ${regular.toFixed(2)}` }
    : undefined;

  const product: NormalizedProduct = {
    chain: 'ottos',
    id: raw.code ?? '',
    name,
    brand: raw.brand || undefined,
    size,
    price: {
      current,
      regular: onSale ? regular : undefined,
      currency: 'CHF',
    },
    tags: deriveOttosTags(name, raw.brand, categoryNames, labels),
    category: categoryNames.length ? categoryNames : undefined,
    imageUrl: pickPrimaryImage(raw.images),
    promotion,
    raw,
  };

  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

export function normalizePromotion(raw: OttosProductRaw): NormalizedPromotion {
  const current = raw.price?.value;
  const regular = raw.insteadOfPrice?.value;
  return {
    chain: 'ottos',
    productId: raw.code,
    productName: stripHighlight(raw.name),
    price: current !== undefined
      ? { current, regular: regular !== undefined && regular > current ? regular : undefined, currency: 'CHF' }
      : undefined,
    description: regular !== undefined && current !== undefined && regular > current
      ? `Statt CHF ${regular.toFixed(2)}`
      : undefined,
  };
}
