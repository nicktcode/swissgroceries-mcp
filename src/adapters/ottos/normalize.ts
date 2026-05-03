import type {
  NormalizedProduct, NormalizedPromotion, NormalizedStore, StockResult, WeekHours, Unit,
} from '../types.js';
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
// Otto's storefront has two hosts: www.ottos.ch (HTML pages) and
// api.ottos.ch (OCC API + image CDN). The OCC `assets[].url` field gives
// a path-only string like "/medias/product-main-100247-01?context=...".
// Combining with www.ottos.ch returns 302→HTML; the actual JPEG lives on
// api.ottos.ch. Verified live 2026-04-30.
const IMAGE_BASE = 'https://api.ottos.ch';

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
  productLabels?: OttosProductLabel[] | null;
  purchasable?: boolean;
}

export interface OttosProductLabel {
  style?: string;
  type?: string;
  message?: { raw?: string; key?: string };
}

function productLabelTexts(labels: OttosProductLabel[] | null | undefined): string[] {
  if (!labels) return [];
  return labels.flatMap((l) => {
    const raw = l.message?.raw;
    const key = l.message?.key;
    return [raw, key].filter((x): x is string => typeof x === 'string' && x.length > 0);
  });
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

  const realCategories = (raw.categories ?? []).filter(
    (c) => !c.excludeFromProductBreadcrumb,
  );
  const categoryNames = realCategories.map((c) => c.name ?? '').filter(Boolean);

  // Top-level department = first non-meta category. Otto's codes are
  // 'm_20000' (Beauty & Gesundheit), 'm_30000' (Lebensmittel), etc.
  // The 5-digit segment is stable and the first one in the array is
  // the deepest-applicable top-level (excludeFromProductBreadcrumb
  // already filtered M_ROOT and M_SHOP).
  const topCat = realCategories[0];
  const department =
    topCat && topCat.code && topCat.name
      ? { id: topCat.code, name: topCat.name }
      : undefined;

  const labels = productLabelTexts(raw.productLabels);

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
    department,
    // Otto's responses carry `url` as a path (e.g. "/c/.../p/123"); prepend
    // the canonical host to make a deep-linkable URL.
    productUrl: typeof (raw as { url?: unknown }).url === 'string' && (raw as { url: string }).url.startsWith('/')
      ? `https://www.ottos.ch${(raw as { url: string }).url}`
      : undefined,
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

interface OttosOpeningTime {
  formattedHour?: string;
  hour?: number;
  minute?: number;
  meridiemIndicator?: string;
}

interface OttosWeekDayOpening {
  closed?: boolean;
  weekDay?: string;
  openingTime?: OttosOpeningTime;
  closingTime?: OttosOpeningTime;
}

interface OttosAddressRaw {
  line1?: string;
  line2?: string;
  postalCode?: string;
  town?: string;
}

export interface OttosStoreRaw {
  name?: string;            // store ID, e.g. "0074"
  displayName?: string;     // human label, e.g. "OTTO'S Wettingen"
  formattedDistance?: string;
  geoPoint?: { latitude?: number; longitude?: number };
  address?: OttosAddressRaw;
  openingHours?: { weekDayOpeningList?: OttosWeekDayOpening[] };
  todaySchedule?: OttosWeekDayOpening;
  stockInfo?: { stockLevel?: number; stockLevelStatus?: string };
}

const WEEKDAY_KEY: Record<string, keyof WeekHours> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sunday: 'sun',
};

function formatHours(o: OttosWeekDayOpening): string | undefined {
  if (o.closed) return 'closed';
  const open = o.openingTime?.formattedHour;
  const close = o.closingTime?.formattedHour;
  if (!open || !close) return undefined;
  return `${open}-${close}`;
}

export function normalizeStore(raw: OttosStoreRaw): NormalizedStore {
  // Address line2 in Otto's data is typically a house number ("99").
  // Concatenate when present rather than dropping it.
  const street = [raw.address?.line1, raw.address?.line2].filter(Boolean).join(' ').trim();

  const hours: WeekHours = {};
  for (const day of raw.openingHours?.weekDayOpeningList ?? []) {
    const key = day.weekDay && WEEKDAY_KEY[day.weekDay.toLowerCase()];
    if (!key) continue;
    const formatted = formatHours(day);
    if (formatted) hours[key] = formatted;
  }

  return {
    chain: 'ottos',
    id: raw.name ?? '',
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
    hours: Object.keys(hours).length ? hours : undefined,
  };
}

export function normalizeStockResult(raw: OttosStoreRaw): StockResult {
  const status = raw.stockInfo?.stockLevelStatus ?? 'outOfStock';
  return {
    store: normalizeStore(raw),
    inStock: status === 'inStock' || status === 'lowStock',
    quantity: typeof raw.stockInfo?.stockLevel === 'number' ? raw.stockInfo.stockLevel : undefined,
  };
}
