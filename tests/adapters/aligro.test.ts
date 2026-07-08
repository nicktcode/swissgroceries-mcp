import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeProduct, normalizePromotion, normalizeStore, parseSize,
} from '../../src/adapters/aligro/normalize.js';
import {
  AligroArticleSchema, AligroSearchContainerSchema, AligroMarketSchema,
} from '../../src/adapters/aligro/schemas.js';

describe('aligro parseSize', () => {
  it('handles 250 g', () => expect(parseSize('250 g')).toEqual({ value: 250, unit: 'g' }));
  it('handles env. 1 kg (skips prefix)', () => expect(parseSize('env. 1 kg')).toEqual({ value: 1, unit: 'kg' }));
  it('handles 1.5 l', () => expect(parseSize('1.5 l')).toEqual({ value: 1.5, unit: 'l' }));
  it('handles 500ml', () => expect(parseSize('500ml')).toEqual({ value: 500, unit: 'ml' }));
  it('handles 33cl converts to ml', () => expect(parseSize('33cl')).toEqual({ value: 330, unit: 'ml' }));
  it('returns undefined for empty', () => expect(parseSize('')).toBeUndefined());
  it('returns undefined for null', () => expect(parseSize(null)).toBeUndefined());
});

const pricedArticle = {
  sKU: '21537-KG',
  translations: {
    fr: {
      description: 'Saumon Norvège Vidé 2/3 kg',
      advertisingText: 'Saumon frais, 2-3 kg',
      origin: 'de Norvège',
      weightVolume: null,
      quantityLabel: null,
    },
  },
  quantityLabelForUnitPrice: 'kg',
  article: { articleGroup: { code: 1210, translations: { fr: { wording: 'Poissons, fruits de mer frais' } } } },
  href: { self: 'https://www.aligro.ch/produits/21537-KG/saumon' },
  images: { main: { 'image/jpeg': 'https://www.aligro.ch/img.jpeg' } },
  mainArticleDetailPrice: {
    salesPriceTTC: 14, discountPriceTTC: 9.2, unitPrice: 8.97, discountRatePrivate: 0.34,
  },
};

describe('aligro normalizeProduct', () => {
  it('maps chain, id (sKU) and both promo + regular price', () => {
    const p = normalizeProduct(pricedArticle)!;
    expect(p.chain).toBe('aligro');
    expect(p.id).toBe('21537-KG');
    expect(p.price.current).toBeCloseTo(9.2);
    expect(p.price.regular).toBeCloseTo(14);
    expect(p.price.currency).toBe('CHF');
  });

  it('returns null for out-of-action articles (no price online)', () => {
    expect(normalizeProduct({ sKU: 'X', mainArticleDetailPrice: null })).toBeNull();
    expect(normalizeProduct({ sKU: 'X', mainArticleDetailPrice: { salesPriceTTC: 5 } })).toBeNull();
  });

  it('prefers Aligro unitPrice and maps the per label', () => {
    const p = normalizeProduct(pricedArticle)!;
    expect(p.unitPrice).toEqual({ value: 8.97, per: 'kg' });
  });

  it('derives swiss-made tag from Swiss origin', () => {
    const p = normalizeProduct({
      ...pricedArticle,
      translations: { fr: { description: 'Poulet', origin: 'de Suisse' } },
    })!;
    expect(p.tags).toContain('swiss-made');
  });

  it('exposes discount rate as a promotion description', () => {
    const p = normalizeProduct(pricedArticle)!;
    expect(p.promotion?.description).toBe('-34%');
  });

  it('builds category, department, image and product url', () => {
    const p = normalizeProduct(pricedArticle)!;
    expect(p.category).toEqual(['Poissons, fruits de mer frais']);
    expect(p.department).toEqual({ id: '1210', name: 'Poissons, fruits de mer frais' });
    expect(p.imageUrl).toContain('img.jpeg');
    expect(p.productUrl).toContain('/produits/21537-KG/');
  });
});

describe('aligro normalizePromotion', () => {
  it('maps a priced article to a promotion', () => {
    const p = normalizePromotion(pricedArticle)!;
    expect(p.chain).toBe('aligro');
    expect(p.productId).toBe('21537-KG');
    expect(p.productName).toBe('Saumon Norvège Vidé 2/3 kg');
    expect(p.price?.current).toBeCloseTo(9.2);
    expect(p.price?.regular).toBeCloseTo(14);
    expect(p.description).toBe('-34%');
  });

  it('returns null for out-of-action articles', () => {
    expect(normalizePromotion({ sKU: 'X', mainArticleDetailPrice: null })).toBeNull();
  });
});

describe('aligro normalizeStore', () => {
  it('maps a market (name only, no geo)', () => {
    const s = normalizeStore({ id: 3, code: 2, translations: { fr: { name: 'Genève' }, de: { name: 'Genf' } } });
    expect(s.chain).toBe('aligro');
    expect(s.id).toBe('3');
    expect(s.name).toBe('Genève');
    expect(s.address.city).toBe('Genève');
    expect(s.location).toEqual({ lat: 0, lng: 0 });
  });
});

describe('aligro normalize fixture', () => {
  it('parses the search-saumon fixture: priced map, unpriced drop', () => {
    let container: any;
    try {
      container = JSON.parse(readFileSync('tests/fixtures/aligro/search-saumon.json', 'utf8'));
    } catch {
      return;
    }
    const items: any[] = container.items ?? [];
    expect(items.length).toBeGreaterThan(0);

    const products = items.map(normalizeProduct).filter((p) => p !== null);
    const pricedCount = items.filter((a) => a.mainArticleDetailPrice).length;
    expect(products.length).toBe(pricedCount);
    for (const p of products) {
      expect(p!.chain).toBe('aligro');
      expect(typeof p!.price.current).toBe('number');
      expect(p!.price.current).toBeGreaterThan(0);
    }
  });
});

describe('aligro schemas (zod validation)', () => {
  it('AligroArticleSchema accepts a minimal article and passes through unknown fields', () => {
    const r = AligroArticleSchema.safeParse({ sKU: 'X', unknownField: 42 });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).unknownField).toBe(42);
  });

  it('AligroMarketSchema accepts a market entry', () => {
    expect(AligroMarketSchema.safeParse({ id: 1, translations: { fr: { name: 'Chavannes' } } }).success).toBe(true);
  });

  it('AligroSearchContainerSchema validates the fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/aligro/search-saumon.json', 'utf8')); }
    catch { return; }
    const r = AligroSearchContainerSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) expect(Array.isArray(r.data.items)).toBe(true);
  });
});
