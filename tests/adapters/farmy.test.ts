import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizePromotion, parseFarmySize } from '../../src/adapters/farmy/normalize.js';
import { FarmyProductSchema, FarmySearchResponseSchema } from '../../src/adapters/farmy/schemas.js';

describe('farmy parseFarmySize', () => {
  it('parses 100g from packaging', () => {
    expect(parseFarmySize('100g')).toEqual({ value: 100, unit: 'g' });
  });
  it('parses 1l', () => expect(parseFarmySize('1l')).toEqual({ value: 1, unit: 'l' }));
  it('parses 33cl as 330ml', () => expect(parseFarmySize('33cl')).toEqual({ value: 330, unit: 'ml' }));
  it('extracts size from name suffix ", 100g"', () => {
    expect(parseFarmySize('Bio Brezeli, 100g')).toEqual({ value: 100, unit: 'g' });
  });
  it('returns undefined for unparseable', () => expect(parseFarmySize('Stück')).toBeUndefined());
  it('returns undefined for empty', () => expect(parseFarmySize('')).toBeUndefined());
});

describe('farmy normalizeProduct', () => {
  it('reads numeric price', () => {
    const p = normalizeProduct({ id: 1, name: 'Test', price: 3.2 });
    expect(p.price.current).toBeCloseTo(3.2);
    expect(p.price.currency).toBe('CHF');
    expect(p.chain).toBe('farmy');
  });

  it('falls back to display_price string', () => {
    const p = normalizeProduct({ id: 1, name: 'Test', display_price: '4.95' });
    expect(p.price.current).toBeCloseTo(4.95);
  });

  it('id falls back to sku when id missing', () => {
    const p = normalizeProduct({ sku: 'FOO', name: 'X', price: 1 });
    expect(p.id).toBe('FOO');
  });

  it('producer.name becomes brand', () => {
    const p = normalizeProduct({ id: 1, name: 'X', price: 1, producer: { name: 'John Baker' } });
    expect(p.brand).toBe('John Baker');
  });

  it('CH-BIO certificate produces organic tag', () => {
    const p = normalizeProduct({
      id: 1, name: 'Karotten', price: 2,
      certificates: [{ name: 'CH-BIO', code: 'ch_bio' }],
    });
    expect(p.tags).toContain('organic');
  });

  it('strikeout_price > price marks promotion + sets regular', () => {
    const p = normalizeProduct({
      id: 1, name: 'X', price: 2.5, strikeout_price: 3.5,
    });
    expect(p.promotion?.description).toContain('Reduziert');
    expect(p.price.regular).toBeCloseTo(3.5);
  });

  it('strikeout_price not greater than price is ignored', () => {
    const p = normalizeProduct({ id: 1, name: 'X', price: 3, strikeout_price: 2.5 });
    expect(p.promotion).toBeUndefined();
    expect(p.price.regular).toBeUndefined();
  });

  it('uses image.md when image is an object', () => {
    const p = normalizeProduct({
      id: 1, name: 'X', price: 1,
      image: { xs: 'a', md: 'b', preview: 'c' },
    });
    expect(p.imageUrl).toBe('b');
  });

  it('decodes price_per_100g (in CHF/100g) into kg unit price', () => {
    const p = normalizeProduct({
      id: 1, name: 'Apfel', price: 5, packaging: '500g', price_per_100g: '1.0',
    });
    expect(p.unitPrice).toEqual({ value: 10, per: 'kg' });
  });
});

describe('farmy normalizePromotion', () => {
  it('populates productName + price + description for sale item', () => {
    const promo = normalizePromotion({
      id: 1, name: 'Bio Pasta', price: 3, strikeout_price: 4.5,
    });
    expect(promo.productName).toBe('Bio Pasta');
    expect(promo.chain).toBe('farmy');
    expect(promo.price?.current).toBeCloseTo(3);
    expect(promo.description).toContain('Reduziert');
  });
});

describe('farmy schemas (zod validation)', () => {
  it('FarmyProductSchema accepts a minimal valid product', () => {
    const r = FarmyProductSchema.safeParse({ id: 1, name: 'X' });
    expect(r.success).toBe(true);
  });
  it('FarmyProductSchema accepts string id and passes through unknown fields', () => {
    const r = FarmyProductSchema.safeParse({ id: 'abc', extraThing: 42 });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).extraThing).toBe(42);
  });
  it('FarmySearchResponseSchema accepts empty product list', () => {
    const r = FarmySearchResponseSchema.safeParse({ products: [], total_count: 0 });
    expect(r.success).toBe(true);
  });
});

describe('farmy fixture', () => {
  it('parses live search-milch fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/farmy/search-milch.json', 'utf8')); }
    catch { return; }
    const validated = FarmySearchResponseSchema.safeParse(raw);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    const products = (validated.data.products ?? []) as any[];
    expect(products.length).toBeGreaterThan(0);
    const p = normalizeProduct(products[0]);
    expect(p.chain).toBe('farmy');
    expect(typeof p.price.current).toBe('number');
    expect(p.id).not.toBe('');
  });
});
