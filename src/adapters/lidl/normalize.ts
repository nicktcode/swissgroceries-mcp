import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveLidlTags } from './tags.js';

const SIZE_RX = /([\d.,]+)\s*(g|kg|ml|cl|dl|l|er|stk|stück|stueck)/i;

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
    case 'stück':
    case 'stueck':
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
  // Lidl's API explicitly distinguishes online vs in-store inventory.
  // Most current responses are isStore-only — Lidl Schweiz doesn't run
  // an online shop, just a digital flyer. Surface this so consumers
  // know not to offer a 'buy now' CTA for the product.
  isOnline?: boolean;
  isStore?: boolean;
}

export function normalizeProduct(raw: LidlProductRaw): NormalizedProduct {
  const name = raw.title ?? '';

  // Size: try subtitle first, then additionalInfo, then description
  const sizeText = raw.subtitle || raw.additionalInfo || raw.description;
  const size = parseSize(sizeText);

  // Price: real API uses mainPrice block; fall back to plan-draft price block
  const current = raw.mainPrice?.price ?? raw.price?.price ?? 0;
  const regular = raw.mainPrice?.oldPrice ?? raw.price?.oldPrice;

  // Map Lidl's two booleans into our normalized availability enum.
  // Defensive on undefined — old fixture data without the flags falls
  // through to availability=undefined (caller treats as 'unknown').
  let availability: 'online' | 'store-only' | 'both' | undefined;
  if (raw.isOnline === true && raw.isStore === true) availability = 'both';
  else if (raw.isOnline === true) availability = 'online';
  else if (raw.isStore === true) availability = 'store-only';

  const p: NormalizedProduct = {
    chain: 'lidl',
    id: raw.id ?? '',
    name,
    brand: raw.brand || undefined,
    size,
    price: { current, regular, currency: 'CHF' },
    tags: deriveLidlTags(name),
    imageUrl: raw.imageUrl ?? raw.imageUrls?.[0],
    availability,
    promotion: raw.validUntil ? { endsAt: raw.validUntil } : undefined,
    raw,
  };
  p.unitPrice = computeUnitPrice(current, size);
  annotateMultipack(p);
  return p;
}

// ---------------------------------------------------------------------------
// Web storefront search API (/q/api/search) — full catalogue, localized.
// Each product hit's fields live under item.gridbox.data.
// ---------------------------------------------------------------------------

// Named HTML entities Lidl actually emits in keyfacts (accented Latin for
// fr/de/it, plus the structural &nbsp;/&amp;). Decoding — not stripping — matters:
// the variable-weight markers we key on ("à la pièce", "pièce") are spelled with
// these accents, so replacing &egrave; with a space would silently break the
// per-100 g detection on French and Italian items.
const NAMED_ENTITIES: Record<string, string> = {
  agrave: 'à', Agrave: 'À', eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È',
  ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï', ocirc: 'ô', ograve: 'ò',
  oelig: 'œ', Oelig: 'Œ', ugrave: 'ù', ucirc: 'û', ccedil: 'ç', Ccedil: 'Ç',
  auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß',
  nbsp: ' ', amp: '&',
};

// A malformed numeric entity (out-of-range or non-integer) would make
// String.fromCodePoint throw a RangeError that bubbles up and degrades the whole
// search to `unavailable` over a single bad product — fall back to a space.
function fromCodePointSafe(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
}

function decodeEntities(s: string): string {
  return s
    // hasOwnProperty.call, not `name in`: the latter also resolves inherited
    // Object.prototype keys, so "&constructor;"/"&toString;" would inject the
    // function's source text into user-facing copy.
    .replace(/&([a-z]+);/gi, (_, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : ' ')
    .replace(/&#(\d+);/g, (_, code) => fromCodePointSafe(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => fromCodePointSafe(parseInt(code, 16)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function toNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

function perUnitFrom(
  ref: { value: number; unit: Unit } | undefined,
  price: number,
): { value: number; per: 'kg' | 'l' | 'piece' } | undefined {
  if (!ref || price <= 0) return undefined;
  if (ref.unit === 'g' || ref.unit === 'kg') {
    const kg = ref.unit === 'g' ? ref.value / 1000 : ref.value;
    return kg > 0 ? { value: Math.round((price / kg) * 100) / 100, per: 'kg' } : undefined;
  }
  if (ref.unit === 'ml' || ref.unit === 'l') {
    const l = ref.unit === 'ml' ? ref.value / 1000 : ref.value;
    return l > 0 ? { value: Math.round((price / l) * 100) / 100, per: 'l' } : undefined;
  }
  return undefined;
}

/**
 * Lidl keyfacts pack a size hint and (often) an explicit base price into a small
 * HTML list, e.g. "<li>2 x 400 g</li> <li>100 g = 1.87</li>" for a fixed pack, or
 * "<li>À la pièce</li> <li>100 g</li> <li>Env. 800-1200 g</li>" for a
 * variable-weight fresh item whose shown price is per 100 g.
 *
 * `unitPrice` is taken from the explicit base price when present (most reliable),
 * else derived from the per-100 g basis of a variable-weight item. `size` is the
 * multipack total ("N x M unit") or a single standalone size — never the 100 g
 * pricing basis, which would misstate a real pack.
 */
export function parseKeyfacts(
  descriptionHtml: string | undefined,
  currentPrice: number,
): { size?: { value: number; unit: Unit }; unitPrice?: { value: number; per: 'kg' | 'l' | 'piece' } } {
  if (!descriptionHtml) return {};
  const text = stripHtml(descriptionHtml);

  // 1. Explicit base price: "100 g = 1.87".
  const base = text.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l)\s*=\s*([\d.,]+)/i);
  let unitPrice = base ? perUnitFrom(parseSize(`${base[1]} ${base[2]}`), toNum(base[3])) : undefined;

  // 2. Pack size from a multipack "N x M unit".
  let size: { value: number; unit: Unit } | undefined;
  const mult = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l)/i);
  if (mult) size = parseSize(`${toNum(mult[1]) * toNum(mult[2])} ${mult[3]}`);

  // 3. Variable-weight item priced per 100 g/ml. Markers by locale: fr "à la
  //    pièce" / "env.", de "ca." / "circa", it "al pezzo" / "circa". No \b before
  //    accented phrases — JS word boundaries are ASCII-only and misfire on "à".
  //    A bare weight range ("800-1200 g") is also a variable-weight tell: it lets
  //    us read the "100 g" line as the pricing basis, not the pack size, even
  //    when the localized marker word is absent from a given listing.
  const variable =
    /(à la pièce|al pezzo|per pezzo|env\.|circa|(?:^|[^a-z])ca\.)/i.test(text) ||
    /\d+\s*[-–]\s*\d+\s*(g|kg|ml|cl|dl|l)\b/i.test(text);
  if (!unitPrice && variable) {
    const basis = text.match(/\b(100)\s*(g|ml)\b/i);
    if (basis) unitPrice = perUnitFrom(parseSize(`${basis[1]} ${basis[2]}`), currentPrice);
  }

  // 4. Fixed single pack: first standalone size that isn't the base-price ref or
  // the per-100 g basis of a variable item.
  if (!size && !variable) {
    for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|dl|l)\b/gi)) {
      const followedByEquals = /^\s*=/.test(text.slice(m.index! + m[0].length));
      if (followedByEquals) continue;
      size = parseSize(`${m[1]} ${m[2]}`);
      break;
    }
  }

  return { size, unitPrice };
}

interface LidlSearchData {
  itemId?: number;
  productId?: number;
  fullTitle?: string;
  title?: string;
  brand?: { name?: string };
  price?: {
    price?: number;
    oldPrice?: number;
    currencyCode?: string;
    discount?: { discountText?: string; showDiscount?: boolean };
  };
  keyfacts?: { description?: string };
  image?: string;
  canonicalPath?: string;
  online?: boolean;
  store?: boolean;
  stockAvailability?: {
    badgeInfoV2?: Array<{ badges?: Array<{ text?: string }>; validFrom?: number; validUntil?: number }>;
  };
}

export function normalizeSearchProduct(data: LidlSearchData): NormalizedProduct {
  const name = data.fullTitle ?? data.title ?? '';
  const current = data.price?.price ?? 0;
  const regular = data.price?.oldPrice && data.price.oldPrice > 0 ? data.price.oldPrice : undefined;

  const { size, unitPrice } = parseKeyfacts(data.keyfacts?.description, current);

  // In-store availability window doubles as the promotion period. Only surface a
  // promotion when there's a real markdown (oldPrice present) — Lidl tags most
  // in-store items "Action"/"Azione" without an actual reference price.
  const badge = data.stockAvailability?.badgeInfoV2?.[0];
  const endsAt = badge?.validUntil ? new Date(badge.validUntil * 1000).toISOString() : undefined;
  const promotion =
    regular !== undefined
      ? { description: data.price?.discount?.discountText || undefined, endsAt }
      : undefined;

  let availability: 'online' | 'store-only' | 'both' | undefined;
  if (data.online === true && data.store === true) availability = 'both';
  else if (data.online === true) availability = 'online';
  else if (data.store === true) availability = 'store-only';

  const p: NormalizedProduct = {
    chain: 'lidl',
    id: String(data.itemId ?? data.productId ?? ''),
    name,
    brand: data.brand?.name || undefined,
    size,
    price: { current, regular, currency: 'CHF' },
    tags: deriveLidlTags(name),
    imageUrl: data.image || undefined,
    productUrl: data.canonicalPath ? `https://www.lidl.ch${data.canonicalPath}` : undefined,
    availability,
    promotion,
    raw: data,
  };
  p.unitPrice = unitPrice ?? computeUnitPrice(current, size);
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
