import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizePromotion, parseVolgshopSize } from '../../src/adapters/volgshop/normalize.js';
import { VolgshopProductSchema, VolgshopSearchResponseSchema } from '../../src/adapters/volgshop/schemas.js';

describe('volgshop parseVolgshopSize', () => {
  it('parses 100g', () => expect(parseVolgshopSize('100g')).toEqual({ value: 100, unit: 'g' }));
  it('parses 1l', () => expect(parseVolgshopSize('1l')).toEqual({ value: 1, unit: 'l' }));
  it('parses 5x28g into total 140g', () => {
    expect(parseVolgshopSize('5x28g')).toEqual({ value: 140, unit: 'g' });
  });
  it('parses 6x33cl into total 1980ml', () => {
    expect(parseVolgshopSize('6x33cl')).toEqual({ value: 1980, unit: 'ml' });
  });
  it('returns undefined for empty', () => expect(parseVolgshopSize('')).toBeUndefined());
});

describe('volgshop normalizeProduct', () => {
  it('converts minor-unit price string to CHF', () => {
    const p = normalizeProduct({
      id: 1, name: 'Test',
      prices: { price: '195', regular_price: '195', currency_minor_unit: 2 },
    });
    expect(p.price.current).toBeCloseTo(1.95);
    expect(p.chain).toBe('volgshop');
  });

  it('flags promotion when on_sale and sale < regular', () => {
    const p = normalizeProduct({
      id: 1, name: 'Test', on_sale: true,
      prices: { price: '150', regular_price: '195', sale_price: '150', currency_minor_unit: 2 },
    });
    expect(p.promotion?.description).toContain('Reduziert');
    expect(p.price.regular).toBeCloseTo(1.95);
  });

  it('does not flag promotion when on_sale=false', () => {
    const p = normalizeProduct({
      id: 1, name: 'Test', on_sale: false,
      prices: { price: '195', regular_price: '195', sale_price: '195', currency_minor_unit: 2 },
    });
    expect(p.promotion).toBeUndefined();
    expect(p.price.regular).toBeUndefined();
  });

  it('extracts size from Mengeneinheit attribute', () => {
    const p = normalizeProduct({
      id: 1, name: 'Test',
      prices: { price: '100', currency_minor_unit: 2 },
      attributes: [{ name: 'Mengeneinheit', terms: [{ name: '500g' }] }],
    });
    expect(p.size).toEqual({ value: 500, unit: 'g' });
  });

  it('extracts unit price from 100gr/100ml-Preis attribute', () => {
    const p = normalizeProduct({
      id: 1, name: 'Test',
      prices: { price: '195', currency_minor_unit: 2 },
      attributes: [
        { name: 'Mengeneinheit', terms: [{ name: '500g' }] },
        { name: '100gr/100ml-Preis', terms: [{ name: '100g=0,40' }] },
      ],
    });
    // 0.40 CHF / 100g → 4.00 CHF / kg
    expect(p.unitPrice).toEqual({ value: 4, per: 'kg' });
  });

  it('decodes HTML entities in category names', () => {
    const p = normalizeProduct({
      id: 1, name: 'X',
      prices: { price: '100', currency_minor_unit: 2 },
      categories: [{ name: 'Jogurt, Quark &amp; Desserts' }],
    });
    expect(p.category?.[0]).toBe('Jogurt, Quark & Desserts');
  });

  it('uses brands[0].name when brand info is present', () => {
    const p = normalizeProduct({
      id: 1, name: 'X',
      prices: { price: '100', currency_minor_unit: 2 },
      brands: [{ name: 'Volg' }],
    });
    expect(p.brand).toBe('Volg');
  });
});

describe('volgshop normalizePromotion', () => {
  it('populates productName for typical promo input', () => {
    const promo = normalizePromotion({
      id: 1, name: 'Bio Spaghetti',
      prices: { price: '199', regular_price: '249', currency_minor_unit: 2 },
    });
    expect(promo.productName).toBe('Bio Spaghetti');
    expect(promo.chain).toBe('volgshop');
    expect(promo.price?.current).toBeCloseTo(1.99);
    expect(promo.description).toContain('Reduziert');
  });
});

describe('volgshop schemas (zod validation)', () => {
  it('VolgshopProductSchema accepts a minimal product', () => {
    const r = VolgshopProductSchema.safeParse({ id: 1, name: 'X' });
    expect(r.success).toBe(true);
  });

  it('VolgshopSearchResponseSchema accepts an empty array', () => {
    const r = VolgshopSearchResponseSchema.safeParse([]);
    expect(r.success).toBe(true);
  });

  it('VolgshopSearchResponseSchema rejects a non-array', () => {
    const r = VolgshopSearchResponseSchema.safeParse({ products: [] });
    expect(r.success).toBe(false);
  });
});

describe('volgshop fixture', () => {
  it('parses live search-milch fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/volgshop/search-milch.json', 'utf8')); }
    catch { return; }
    const validated = VolgshopSearchResponseSchema.safeParse(raw);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    expect(validated.data.length).toBeGreaterThan(0);
    const p = normalizeProduct(validated.data[0]);
    expect(p.chain).toBe('volgshop');
    expect(typeof p.price.current).toBe('number');
    expect(p.id).not.toBe('');
  });
});
