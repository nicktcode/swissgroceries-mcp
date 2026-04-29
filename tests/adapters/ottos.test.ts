import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeProduct, normalizePromotion, parseOttosSize, stripHighlight, isGroceryProduct,
} from '../../src/adapters/ottos/normalize.js';
import { OttosProductSchema, OttosSearchResponseSchema } from '../../src/adapters/ottos/schemas.js';

describe('ottos parseOttosSize', () => {
  it('parses 1kg', () => expect(parseOttosSize('1kg')).toEqual({ value: 1, unit: 'kg' }));
  it('parses 500g', () => expect(parseOttosSize('500g')).toEqual({ value: 500, unit: 'g' }));
  it('parses 33cl as 330ml', () => expect(parseOttosSize('33cl')).toEqual({ value: 330, unit: 'ml' }));
  it('parses 6x33cl as 1980ml', () => {
    expect(parseOttosSize('6x33cl')).toEqual({ value: 1980, unit: 'ml' });
  });
  it('extracts size from name', () => {
    expect(parseOttosSize('Barilla Spaghetti Nr. 5 1 kg')).toEqual({ value: 1, unit: 'kg' });
  });
  it('returns undefined for empty', () => expect(parseOttosSize('')).toBeUndefined());
});

describe('ottos stripHighlight', () => {
  it('removes <em> highlight tags from search response', () => {
    expect(stripHighlight('Barilla <em class="search-results-highlight">Spaghetti Nr. 5 1</em> kg'))
      .toBe('Barilla Spaghetti Nr. 5 1 kg');
  });
  it('collapses whitespace', () => expect(stripHighlight('a   b\n\nc')).toBe('a b c'));
  it('handles empty', () => expect(stripHighlight('')).toBe(''));
  it('handles undefined', () => expect(stripHighlight(undefined)).toBe(''));
});

describe('ottos isGroceryProduct', () => {
  it('keeps products in m_10000 (Supermarkt) tree', () => {
    expect(isGroceryProduct({ categories: [{ code: 'M_ROOT' }, { code: 'm_10000' }, { code: 'm_10100' }] })).toBe(true);
  });
  it('keeps products in m_20000 (Beauty) tree', () => {
    expect(isGroceryProduct({ categories: [{ code: 'm_20000' }, { code: 'm_20300' }] })).toBe(true);
  });
  it('keeps products in m_30000 (Baby) tree', () => {
    expect(isGroceryProduct({ categories: [{ code: 'm_30000' }] })).toBe(true);
  });
  it('drops clothing m_60000 products', () => {
    expect(isGroceryProduct({ categories: [{ code: 'm_60000' }, { code: 'm_60100' }] })).toBe(false);
  });
  it('drops products with no categories', () => {
    expect(isGroceryProduct({})).toBe(false);
  });
});

describe('ottos normalizeProduct', () => {
  it('strips HTML highlights from name', () => {
    const p = normalizeProduct({
      code: '100247',
      name: 'Barilla <em>Spaghetti</em> 1 kg',
      price: { value: 2.5, currencyIso: 'CHF', priceType: 'BUY' },
    });
    expect(p.name).toBe('Barilla Spaghetti 1 kg');
    expect(p.chain).toBe('ottos');
  });

  it('reads price.value directly', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1.85, currencyIso: 'CHF' },
    });
    expect(p.price.current).toBeCloseTo(1.85);
    expect(p.price.currency).toBe('CHF');
  });

  it('flags promotion when insteadOfPrice > price', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1.5 },
      insteadOfPrice: { value: 1.95 },
    });
    expect(p.promotion?.description).toContain('Statt');
    expect(p.price.regular).toBeCloseTo(1.95);
  });

  it('does not flag promotion when insteadOfPrice null', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1.5 },
      insteadOfPrice: null,
    });
    expect(p.promotion).toBeUndefined();
    expect(p.price.regular).toBeUndefined();
  });

  it('drops categories flagged excludeFromProductBreadcrumb', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1 },
      categories: [
        { code: 'M_ROOT', name: 'Root', excludeFromProductBreadcrumb: true },
        { code: 'm_10000', name: 'Supermarkt & Weine' },
      ],
    });
    expect(p.category).toEqual(['Supermarkt & Weine']);
  });

  it('prefixes relative image URL with ottos.ch host', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1 },
      images: [{ url: '/medias/foo.jpg', format: 'product-main', imageType: 'PRIMARY' }],
    });
    expect(p.imageUrl).toBe('https://www.ottos.ch/medias/foo.jpg');
  });

  it('keeps absolute image URLs as-is', () => {
    const p = normalizeProduct({
      code: 'X', name: 'X',
      price: { value: 1 },
      images: [{ url: 'https://cdn.example.com/x.jpg' }],
    });
    expect(p.imageUrl).toBe('https://cdn.example.com/x.jpg');
  });

  it('derives bio tag', () => {
    const p = normalizeProduct({
      code: 'X', name: 'Bio Vollmilch',
      price: { value: 1.95 },
    });
    expect(p.tags).toContain('organic');
  });

  it('computes unit price from name-derived size', () => {
    const p = normalizeProduct({
      code: 'X', name: 'Barilla Spaghetti 1 kg',
      price: { value: 2.5 },
    });
    expect(p.unitPrice?.per).toBe('kg');
    expect(p.unitPrice?.value).toBeCloseTo(2.5);
  });
});

describe('ottos normalizePromotion', () => {
  it('strips highlight from name + sets price', () => {
    const promo = normalizePromotion({
      code: 'X', name: '<em>Bio</em> Pasta',
      price: { value: 1.5 },
      insteadOfPrice: { value: 1.95 },
    });
    expect(promo.productName).toBe('Bio Pasta');
    expect(promo.chain).toBe('ottos');
    expect(promo.price?.regular).toBeCloseTo(1.95);
    expect(promo.description).toContain('Statt');
  });
});

describe('ottos schemas (zod validation)', () => {
  it('OttosProductSchema accepts a minimal product', () => {
    const r = OttosProductSchema.safeParse({ code: 'X', name: 'Y' });
    expect(r.success).toBe(true);
  });

  it('OttosSearchResponseSchema accepts an empty products array', () => {
    const r = OttosSearchResponseSchema.safeParse({ products: [] });
    expect(r.success).toBe(true);
  });

  it('OttosSearchResponseSchema passes through unknown fields', () => {
    const r = OttosSearchResponseSchema.safeParse({ products: [], extra: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).extra).toBe(1);
  });
});

describe('ottos fixture', () => {
  it('parses live search-milch fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/ottos/search-milch.json', 'utf8')); }
    catch { return; }
    const validated = OttosSearchResponseSchema.safeParse(raw);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    const products = (validated.data.products ?? []) as any[];
    expect(products.length).toBeGreaterThan(0);
    // Every product in the food-category fixture should be a grocery product.
    expect(products.every(isGroceryProduct)).toBe(true);
    const p = normalizeProduct(products[0]);
    expect(p.chain).toBe('ottos');
    expect(typeof p.price.current).toBe('number');
    expect(p.id).not.toBe('');
  });

  it('parses fixture with rich productLabels objects (regression)', () => {
    // OCC v2's `fields=FULL` returns productLabels as an array of
    // { message: { raw, key }, style, type } objects, not strings.
    // The schema must accept this shape and the normalizer must not crash.
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/ottos/search-elmex-with-labels.json', 'utf8')); }
    catch { return; }
    const validated = OttosSearchResponseSchema.safeParse(raw);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    const products = (validated.data.products ?? []) as any[];
    const labelled = products.find((p) => Array.isArray(p.productLabels) && p.productLabels.length > 0);
    if (labelled) {
      expect(typeof labelled.productLabels[0]).toBe('object');
      expect(() => normalizeProduct(labelled)).not.toThrow();
    }
  });
});
