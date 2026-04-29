import type { NormalizedProduct, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveVolgshopTags } from './tags.js';

// Volgshop /wp-json/wc/store/v1/products shape (verified live 2026-04-29):
//   - prices.price is a STRING in minor units (rappen). currency_minor_unit=2 → divide by 100.
//   - on_sale boolean; sale_price/regular_price in same minor-unit string format.
//   - Size + per-100g price are exposed as `attributes`:
//       attribute "Mengeneinheit" terms = ["1x28g"]            → quantity unit
//       attribute "100gr/100ml-Preis" terms = ["100g=3,75"]    → CHF / 100g
//   - HTML entities appear in category names ("&amp;") — decode before display.
//   - is_in_stock / low_stock_remaining: per-warehouse availability for the online shop.

const SIZE_RX = /([\d.,]+)\s*(kg|g|ml|cl|dl|l)\b/i;
const COUNT_X_SIZE_RX = /(\d+)\s*x\s*([\d.,]+)\s*(kg|g|ml|cl|dl|l)\b/i;

interface ParsedSize { value: number; unit: Unit }

function unitFromText(numberText: string, unitText: string): ParsedSize | undefined {
  const v = parseFloat(numberText.replace(',', '.'));
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

export function parseVolgshopSize(text: string | undefined): ParsedSize | undefined {
  if (!text) return undefined;
  // "5x28g" → total 140g (multipack annotated separately downstream)
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

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

interface VolgshopAttributeTerm { name?: string; slug?: string }
interface VolgshopAttribute { name?: string; terms?: VolgshopAttributeTerm[] }

interface VolgshopPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
}

interface VolgshopImage { src?: string; thumbnail?: string }
interface VolgshopCategory { name?: string }
interface VolgshopTag { name?: string }
interface VolgshopBrand { name?: string }

export interface VolgshopProductRaw {
  id?: number | string;
  name?: string;
  sku?: string;
  slug?: string;
  permalink?: string;
  description?: string | null;
  short_description?: string | null;
  on_sale?: boolean;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  prices?: VolgshopPrices;
  images?: VolgshopImage[];
  categories?: VolgshopCategory[];
  tags?: VolgshopTag[];
  brands?: VolgshopBrand[];
  attributes?: VolgshopAttribute[];
}

function parseMinorPrice(s: string | undefined, minorUnit: number): number | undefined {
  if (s == null) return undefined;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return n / Math.pow(10, minorUnit);
}

function attributeTerm(attrs: VolgshopAttribute[] | undefined, namePattern: RegExp): string | undefined {
  if (!attrs) return undefined;
  for (const a of attrs) {
    if (!a.name || !namePattern.test(a.name)) continue;
    return a.terms?.[0]?.name;
  }
  return undefined;
}

export function normalizeProduct(raw: VolgshopProductRaw): NormalizedProduct {
  const name = raw.name ?? '';
  const minorUnit = raw.prices?.currency_minor_unit ?? 2;

  const current = parseMinorPrice(raw.prices?.price, minorUnit) ?? 0;
  const regular = parseMinorPrice(raw.prices?.regular_price, minorUnit);
  const sale    = parseMinorPrice(raw.prices?.sale_price, minorUnit);

  const sizeText = attributeTerm(raw.attributes, /menge|grösse|gr[oö]sse|inhalt/i);
  const size = parseVolgshopSize(sizeText) ?? parseVolgshopSize(name);

  const per100Text = attributeTerm(raw.attributes, /100\s*(g|gr|ml)|grundpreis/i);
  // term format "100g=3,75"
  let per100Value: number | undefined;
  let per100Unit: 'kg' | 'l' | undefined;
  if (per100Text) {
    const m = per100Text.match(/100\s*(g|gr|ml)\s*=\s*([\d.,]+)/i);
    if (m) {
      const v = parseFloat(m[2].replace(',', '.'));
      if (Number.isFinite(v) && v > 0) {
        per100Value = v * 10; // CHF / 100g → CHF / kg
        per100Unit = m[1].toLowerCase().startsWith('m') ? 'l' : 'kg';
      }
    }
  }

  const categoryNames = (raw.categories ?? []).map((c) => decodeHtmlEntities(c.name ?? '')).filter(Boolean);
  const tagNames = (raw.tags ?? []).map((t) => t.name ?? '').filter(Boolean);

  const onSale = raw.on_sale === true && regular !== undefined && sale !== undefined && sale < regular;
  const promotion = onSale && regular !== undefined
    ? { description: `Reduziert von CHF ${regular.toFixed(2)}` }
    : undefined;

  const product: NormalizedProduct = {
    chain: 'volgshop',
    id: String(raw.id ?? raw.sku ?? ''),
    name,
    brand: raw.brands?.[0]?.name || undefined,
    size,
    price: {
      current,
      regular: onSale ? regular : undefined,
      currency: 'CHF',
    },
    tags: deriveVolgshopTags(name, categoryNames, tagNames),
    category: categoryNames.length ? categoryNames : undefined,
    imageUrl: raw.images?.[0]?.src,
    promotion,
    raw,
  };

  if (per100Value !== undefined && per100Unit) {
    product.unitPrice = { value: per100Value, per: per100Unit };
  } else {
    product.unitPrice = computeUnitPrice(current, size);
  }

  annotateMultipack(product);
  return product;
}

export function normalizePromotion(raw: VolgshopProductRaw): NormalizedPromotion {
  const minorUnit = raw.prices?.currency_minor_unit ?? 2;
  const current = parseMinorPrice(raw.prices?.price, minorUnit);
  const regular = parseMinorPrice(raw.prices?.regular_price, minorUnit);
  return {
    chain: 'volgshop',
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
