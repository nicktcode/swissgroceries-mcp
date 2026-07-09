import type { NormalizedProduct, NormalizedPromotion, Unit } from '../types.js';
import { computeUnitPrice } from '../../util/unit-price.js';
import { annotateMultipack } from '../../util/multipack.js';
import { deriveAligroTags } from './tags.js';
import type { AligroArticle } from './schemas.js';

const BASE = 'https://www.aligro.ch';

// weightVolume / quantityLabel examples: "env. 1 kg", "250 g", "1.4-1.6 kg",
// "6 x 400 g". Take the first plausible size token.
const SIZE_RX = /([\d.,]+)\s*(kg|ml|cl|dl|l|g|pi[eè]ce|stk|st)\b/i;

export function parseSize(text: string | null | undefined): { value: number; unit: Unit } | undefined {
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
    default: return { value, unit: 'piece' };
  }
}

function unitPer(label: string | null | undefined): 'kg' | 'l' | 'piece' {
  const l = (label ?? '').toLowerCase();
  if (l.includes('kg')) return 'kg';
  if (l === 'l' || l.includes('litre') || l.includes('liter')) return 'l';
  return 'piece';
}

function pickImage(a: AligroArticle): string | undefined {
  const main = a.images?.main;
  if (!main) return undefined;
  return main['image/jpeg'] ?? main['image/webp'] ?? Object.values(main)[0];
}

function pickUrl(a: AligroArticle): string | undefined {
  const self = a.href?.self;
  if (!self) return undefined;
  return self.startsWith('http') ? self : BASE + self;
}

function fr(a: AligroArticle) {
  return a.translations?.fr ?? {};
}

function group(a: AligroArticle): string | undefined {
  return a.article?.articleGroup?.translations?.fr?.wording ?? undefined;
}

/**
 * Aligro only publishes a price for articles currently "en action" (on
 * promotion): `mainArticleDetailPrice` is null otherwise. Because
 * NormalizedProduct.price is mandatory, this returns null for un-priced
 * (out-of-action) articles and the adapter drops them. That is the honest
 * consequence of Aligro not exposing regular prices online.
 */
export function normalizeProduct(a: AligroArticle): NormalizedProduct | null {
  const p = a.mainArticleDetailPrice;
  if (!p || p.discountPriceTTC == null) return null;

  const f = fr(a);
  const name = f.description ?? f.advertisingText ?? '';
  const size = parseSize(f.weightVolume) ?? parseSize(f.quantityLabel);
  const g = group(a);

  const product: NormalizedProduct = {
    chain: 'aligro',
    id: a.sKU ?? String(a.id ?? ''),
    name,
    brand: f.brand ?? undefined,
    size,
    price: { current: p.discountPriceTTC, regular: p.salesPriceTTC ?? undefined, currency: 'CHF' },
    tags: deriveAligroTags([name, f.brand, f.origin, g]),
    category: g ? [g] : undefined,
    imageUrl: pickImage(a),
    productUrl: pickUrl(a),
    department:
      a.article?.articleGroup?.code != null && g
        ? { id: String(a.article.articleGroup.code), name: g }
        : undefined,
    promotion: p.discountRatePrivate
      ? { description: `-${Math.round(p.discountRatePrivate * 100)}%` }
      : undefined,
    raw: a,
  };

  // Prefer Aligro's own unit price when present; otherwise derive from size.
  product.unitPrice =
    p.unitPrice != null
      ? { value: p.unitPrice, per: unitPer(a.quantityLabelForUnitPrice) }
      : computeUnitPrice(p.discountPriceTTC, size);
  annotateMultipack(product);
  return product;
}

export function normalizePromotion(a: AligroArticle): NormalizedPromotion | null {
  const p = a.mainArticleDetailPrice;
  if (!p || p.discountPriceTTC == null) return null;
  const f = fr(a);
  const size = parseSize(f.weightVolume) ?? parseSize(f.quantityLabel);
  return {
    chain: 'aligro',
    productId: a.sKU,
    productName: f.description ?? f.advertisingText ?? '',
    brand: f.brand ?? undefined,
    imageUrl: pickImage(a),
    productUrl: pickUrl(a),
    size,
    unitPrice:
      p.unitPrice != null ? { value: p.unitPrice, per: unitPer(a.quantityLabelForUnitPrice) } : undefined,
    price: { current: p.discountPriceTTC, regular: p.salesPriceTTC ?? undefined, currency: 'CHF' },
    description: p.discountRatePrivate ? `-${Math.round(p.discountRatePrivate * 100)}%` : undefined,
  };
}
