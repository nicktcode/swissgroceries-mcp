import type {
  NormalizedProduct, NormalizedPromotion, NormalizedStore, StockResult, WeekHours, Tag,
} from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { sizeFromName } from '../../util/size-from-name.js';

// Coop City OCC v2 product shape (verified live 2026-10-20):
//   - code: string product number (e.g. "4290522")
//   - name: plain text, often with the size inline ("... 50ml Travel Size")
//   - manufacturer: brand
//   - price: { value, currencyIso: "CHF", formattedValue, priceType: "BUY" }
//   - images: [{ url: "/cooptradingcommercewebservices/v2/medias/<file>?context=...", format, imageType }]
//   - url: storefront path "/kosmetik-gesundheit/.../p/4290522"
//   - categories: [] on search; codes only (no names) on product detail
// There is no was-price on the API: discounted items are only flagged via the
// `hasDiscount` search facet, so promotions carry the current price only.

const SITE = 'https://www.coop-city.ch';
// Image `url`s point at the backend context path, which 404s on the public
// host; the same file is served from /medias/<file>.
const MEDIA_PREFIX = '/cooptradingcommercewebservices/v2/medias/';
const PREFERRED_IMAGE_FORMATS = ['productImage-zoom-SM2x', 'tile-SM2x-XL2x', 'tile-SM-XL'];

export const COOP_CITY_STORE_PREFIX = 'Coop City';

export interface CoopCityImageRaw { url?: string; format?: string; imageType?: string }

export interface CoopCityProductRaw {
  code?: string;
  name?: string;
  manufacturer?: string;
  url?: string;
  price?: { value?: number; currencyIso?: string };
  images?: CoopCityImageRaw[];
}

export interface CoopCityStoreRaw {
  name?: string;          // store ID, e.g. "2194_POS"
  displayName?: string;   // e.g. "Coop City Zürich St. Annahof"
  geoPoint?: { latitude?: number; longitude?: number };
  address?: { line1?: string; line2?: string; postalCode?: string; town?: string };
  openingHours?: { weekDayOpeningList?: Array<{
    weekDay?: string;
    closed?: boolean;
    openingTime?: { formattedHour?: string };
    closingTime?: { formattedHour?: string };
  }> };
  stockInfo?: { stockLevel?: number; stockLevelStatus?: string };
}

const TAGS: Array<[RegExp, Tag]> = [
  [/\bbio\b|naturaline|organic/i, 'organic'],
  [/prix garantie/i, 'budget'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/vegan/i, 'vegan'],
  [/swiss|schweiz/i, 'swiss-made'],
];

function deriveTags(name: string, brand: string | undefined): Tag[] {
  const haystack = `${name} ${brand ?? ''}`;
  return TAGS.filter(([rx]) => rx.test(haystack)).map(([, tag]) => tag);
}

export function imageUrl(images: CoopCityImageRaw[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const chosen = PREFERRED_IMAGE_FORMATS
    .map((f) => images.find((i) => i.format === f))
    .find(Boolean) ?? images.find((i) => i.imageType === 'PRIMARY') ?? images[0];
  const url = chosen?.url;
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return url.startsWith(MEDIA_PREFIX) ? `${SITE}/medias/${url.slice(MEDIA_PREFIX.length)}` : SITE + url;
}

export function normalizeProduct(raw: CoopCityProductRaw): NormalizedProduct {
  const name = (raw.name ?? '').trim();
  const brand = raw.manufacturer || undefined;
  const current = raw.price?.value ?? 0;
  const size = sizeFromName(name);
  const product: NormalizedProduct = {
    chain: 'coopcity',
    id: raw.code ?? '',
    name,
    brand,
    size,
    price: { current, currency: 'CHF' },
    tags: deriveTags(name, brand),
    imageUrl: imageUrl(raw.images),
    productUrl: raw.url?.startsWith('/') ? `${SITE}/de${raw.url}` : undefined,
    raw,
  };
  product.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(product);
  return product;
}

export function normalizePromotion(raw: CoopCityProductRaw): NormalizedPromotion {
  const np = normalizeProduct(raw);
  return {
    chain: 'coopcity',
    productId: np.id,
    productName: np.name,
    brand: np.brand,
    imageUrl: np.imageUrl,
    productUrl: np.productUrl,
    size: np.size,
    unitPrice: np.unitPrice,
    price: np.price,
    // The API flags the discount but exposes no was-price or end date.
    description: 'Aktion',
  };
}

// lang=de returns abbreviated German weekdays ("Mo.", "Di.", ...).
const WEEKDAY_KEY: Record<string, keyof WeekHours> = {
  'mo': 'mon', 'di': 'tue', 'mi': 'wed', 'do': 'thu', 'fr': 'fri', 'sa': 'sat', 'so': 'sun',
  'monday': 'mon', 'tuesday': 'tue', 'wednesday': 'wed', 'thursday': 'thu',
  'friday': 'fri', 'saturday': 'sat', 'sunday': 'sun',
};

export function isCoopCityStore(raw: CoopCityStoreRaw): boolean {
  return (raw.displayName ?? '').startsWith(COOP_CITY_STORE_PREFIX);
}

export function normalizeStore(raw: CoopCityStoreRaw): NormalizedStore {
  const hours: WeekHours = {};
  for (const day of raw.openingHours?.weekDayOpeningList ?? []) {
    const key = WEEKDAY_KEY[(day.weekDay ?? '').toLowerCase().replace(/\.$/, '')];
    if (!key) continue;
    if (day.closed) hours[key] = 'closed';
    else if (day.openingTime?.formattedHour && day.closingTime?.formattedHour) {
      hours[key] = `${day.openingTime.formattedHour}-${day.closingTime.formattedHour}`;
    }
  }
  return {
    chain: 'coopcity',
    id: raw.name ?? '',
    name: raw.displayName ?? raw.name ?? '',
    address: {
      street: [raw.address?.line1, raw.address?.line2].filter(Boolean).join(' ').trim(),
      zip: raw.address?.postalCode ?? '',
      city: raw.address?.town ?? '',
    },
    location: { lat: raw.geoPoint?.latitude ?? 0, lng: raw.geoPoint?.longitude ?? 0 },
    hours: Object.keys(hours).length ? hours : undefined,
  };
}

export function normalizeStockResult(raw: CoopCityStoreRaw): StockResult {
  const status = raw.stockInfo?.stockLevelStatus ?? 'outOfStock';
  return {
    store: normalizeStore(raw),
    inStock: status === 'inStock' || status === 'lowStock',
    // stockLevel appears capped (50 for well-stocked items), so treat it as a floor.
    quantity: typeof raw.stockInfo?.stockLevel === 'number' ? raw.stockInfo.stockLevel : undefined,
  };
}
