import type { NormalizedProduct, NormalizedStore, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveLidlTags } from './tags.js';
import { sizeFromName } from '../../util/size-from-name.js';

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

// ---------------------------------------------------------------------------
// lidl.ch storefront products (search + gridboxes), verified live 2026-10-20:
//   - erpNumber: product ID, e.g. "10060363"
//   - fullTitle: brand + title ("VITTEL Mineralwasser still")
//   - category: "Food" (incl. near-food like drugstore) or "Non Food"
//   - price: { price, oldPrice (0 when not discounted), discount: { showDiscount, discountText } }
//     price is null for announced items that aren't priced yet.
//   - keyfacts.description: HTML <li> list carrying the size and base price.
//     German prefixes the quantity with "Pro"; fr/it list it bare:
//       "Pro 6 x 1,5 l" / "6 x 1,5 l", "1 l = 0.36" -> fixed pack
//       "Pro 100 g", "Ca. 400-800 g" (fr "Env.")   -> variable weight, price per 100 g
//       "Pro kg" / "Le kg" / "Al kg"               -> loose produce, price per kg
//       "Pro 1000 g/ 1200 g", "Pro 108-152 Stück"  -> several variants, no single size
//   - stockAvailability.badgeInfoV2[].validFrom/validUntil: offer window (unix s)

export interface LidlCatalogProductRaw {
  erpNumber?: string;
  fullTitle?: string;
  category?: string;
  canonicalUrl?: string;
  image?: string;
  online?: boolean;
  brand?: { name?: string; showBrand?: boolean } | null;
  price?: {
    price?: number | null;
    oldPrice?: number | null;
    discount?: { showDiscount?: boolean; discountText?: string };
  } | null;
  keyfacts?: { description?: string | null; wonCategoryPrimary?: string; wonCategoryPrimaryPath?: string } | null;
  stockAvailability?: { badgeInfoV2?: Array<{ validFrom?: number; validUntil?: number }> };
}

type Qty = { value: number; unit: Unit };

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', amp: '&',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç',
  icirc: 'î', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', igrave: 'ì', ograve: 'ò',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

export function keyfactLines(description: string | null | undefined): string[] {
  if (!description) return [];
  return [...description.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseQty(text: string): Qty | undefined {
  const t = text.replace(/\(.*?\)/g, '').trim();
  // Several variants ("1000 g/ 1200 g") or ranges ("108-152 Stück"): no single size.
  if (/[\/–]|\d\s*-\s*\d/.test(t)) return undefined;
  if (/^kg$/i.test(t)) return { value: 1, unit: 'kg' };
  if (/^l$/i.test(t)) return { value: 1, unit: 'l' };
  if (/^(stück|stk\.?|pièce|pezzo)$/i.test(t)) return { value: 1, unit: 'piece' };
  const piece = t.match(/^(\d+)\s*(stück|stk\.?|pièces?|pezz[io])$/i);
  if (piece) return { value: Number(piece[1]), unit: 'piece' };
  return sizeFromName(t);
}

// "100 g = 1.52", "1 l = 0.36", "1 Stück = 0.10" -> unit price per kg / l / piece.
function unitPriceFromBaseLine(lines: string[]): { value: number; per: 'kg' | 'l' | 'piece' } | undefined {
  for (const line of lines) {
    const m = line.match(/^(\d+(?:[.,]\d+)?)?\s*(kg|g|ml|l|stück|stk\.?|pièces?|pezz[io])\s*=\s*(\d+(?:[.,]\d+)?)$/i);
    if (!m) continue;
    const qty = parseQty(`${m[1] ?? '1'} ${m[2]}`);
    const price = parseFloat(m[3].replace(',', '.'));
    if (qty && price > 0) return computeUnitPrice(price, qty);
  }
  return undefined;
}

const BARE_QTY_RX = /^(\d+(?:[.,]\d+)?\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|dl|l|stück|stk\.?|pièces?|pezz[io])(\s*\(.*\))?$/i;

// The line stating what the shelf price covers, minus its prefix.
function quantityText(line: string): string | undefined {
  if (line.includes('=')) return undefined;
  const prefixed = line.match(/^(pro|le|la|al|par)\s+(.+)$/i);
  if (prefixed) return prefixed[2];
  return BARE_QTY_RX.test(line) ? line : undefined;
}

export interface LidlKeyfacts {
  /** Pack size, only for fixed packs. */
  size?: Qty;
  /** Quantity the shelf price covers (= size for fixed packs, e.g. 100 g for variable weight). */
  priceBasis?: Qty;
  variableWeight: boolean;
  baseLineUnitPrice?: { value: number; per: 'kg' | 'l' | 'piece' };
}

export function parseKeyfacts(description: string | null | undefined): LidlKeyfacts {
  const lines = keyfactLines(description);
  const pro = lines.map(quantityText).find(Boolean);
  const variableWeight = lines.some((l) => /^(ca|env)\.?\s/i.test(l));
  const priceBasis = pro ? parseQty(pro) : undefined;
  return {
    size: variableWeight ? undefined : priceBasis,
    priceBasis,
    variableWeight,
    baseLineUnitPrice: unitPriceFromBaseLine(lines),
  };
}

export function isCatalogFood(raw: LidlCatalogProductRaw): boolean {
  return raw.category === 'Food';
}

/** Returns null for items without a usable price (announced but not yet priced). */
export function normalizeCatalogProduct(raw: LidlCatalogProductRaw): NormalizedProduct | null {
  const current = raw.price?.price ?? 0;
  if (!(current > 0)) return null;
  const old = raw.price?.oldPrice ?? 0;
  const regular = old > current ? old : undefined;

  const name = (raw.fullTitle ?? '').trim();
  const kf = parseKeyfacts(raw.keyfacts?.description);
  const size = kf.size ?? (kf.variableWeight ? undefined : sizeFromName(name));
  const unitPrice =
    computeUnitPrice(current, kf.variableWeight ? kf.priceBasis : size) ?? kf.baseLineUnitPrice;

  // "Bedürfniswelten/Food und Near Food/Süßigkeiten & Snacks/Schokowaren"
  const catPath = (raw.keyfacts?.wonCategoryPrimary ?? '').split('/').slice(1).filter(Boolean);
  const catCodes = (raw.keyfacts?.wonCategoryPrimaryPath ?? '').split('/');
  const department = catPath[1] && catCodes[2] ? { id: catCodes[2], name: catPath[1] } : undefined;

  const window = raw.stockAvailability?.badgeInfoV2?.find((b) => b.validUntil);
  const discount = raw.price?.discount;
  const promotion = regular !== undefined || discount?.showDiscount
    ? {
        description: discount?.showDiscount ? discount.discountText : undefined,
        endsAt: window?.validUntil ? new Date(window.validUntil * 1000).toISOString() : undefined,
      }
    : undefined;

  const p: NormalizedProduct = {
    chain: 'lidl',
    id: raw.erpNumber ?? '',
    name,
    brand: raw.brand?.showBrand !== false ? raw.brand?.name || undefined : undefined,
    size,
    price: { current, regular, currency: 'CHF' },
    unitPrice,
    tags: deriveLidlTags(name),
    category: catPath.length ? catPath : undefined,
    department,
    imageUrl: raw.image,
    productUrl: raw.canonicalUrl ? `https://www.lidl.ch${raw.canonicalUrl}` : undefined,
    availability: raw.online ? 'both' : 'store-only',
    promotion,
    raw,
  };
  annotateMultipack(p, raw.keyfacts?.description ? keyfactLines(raw.keyfacts.description).join(' ') : undefined);
  return p;
}
