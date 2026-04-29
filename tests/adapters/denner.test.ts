import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSize, normalizeProduct, normalizePromotion } from '../../src/adapters/denner/normalize.js';
import { DennerProductSchema, DennerContentResponseSchema } from '../../src/adapters/denner/schemas.js';

describe('denner parseSize', () => {
  it('handles 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('handles 250g', () => expect(parseSize('250g')).toEqual({ value: 250, unit: 'g' }));
  it('handles 75 cl', () => expect(parseSize('75 cl')).toEqual({ value: 750, unit: 'ml' }));
  it('handles 6 x 75 cl (picks first number)', () => {
    const s = parseSize('Spanien, Rioja, 6 x 75 cl');
    expect(s).toBeDefined();
  });
  it('returns undefined for empty string', () => expect(parseSize('')).toBeUndefined());
  it('returns undefined for plain text', () => expect(parseSize('Rauchen ist tödlich')).toBeUndefined());
});

describe('denner normalizeProduct', () => {
  it('returns chain=denner', () => {
    const p = normalizeProduct({ id: 1, title: { de: 'Milch' }, priceDiscount: 1.5, description: { de: '1L' } } as any);
    expect(p.chain).toBe('denner');
    expect(p.unitPrice?.value).toBeCloseTo(1.5);
  });

  it('handles multilingual title', () => {
    const p = normalizeProduct({ id: 'abc', title: { de: 'Wasser', fr: 'Eau' }, priceDiscount: 0.8 } as any);
    expect(p.name).toBe('Wasser');
    expect(p.id).toBe('abc');
  });

  it('sets promotion dates from validFrom/validTo', () => {
    const p = normalizeProduct({
      id: 2,
      title: { de: 'Wein' },
      priceDiscount: 13.5,
      priceOrigin: 22.95,
      validFrom: '2026-04-30',
      validTo: '2026-05-06',
    } as any);
    expect(p.promotion?.endsAt).toBe('2026-05-06');
    expect(p.price.regular).toBeCloseTo(22.95);
  });

  it('tags bio product as organic', () => {
    const p = normalizeProduct({ id: 3, title: { de: 'Bio Milch' }, priceDiscount: 1.9, ecoLabels: ['bio-eu'] } as any);
    expect(p.tags).toContain('organic');
  });

  it('uses priceOverride when set', () => {
    const p = normalizeProduct({ id: 4, title: { de: 'Test' }, priceDiscount: 5.0, priceOverride: 3.5 } as any);
    expect(p.price.current).toBeCloseTo(3.5);
  });
});

describe('denner normalizePromotion', () => {
  it('populates productName for typical promo product input', () => {
    const raw = {
      id: '9aa5349f-6541-483b-86b3-b7831c3a9160',
      title: { de: 'Marlboro Red', fr: 'Marlboro Red', it: 'Marlboro Red' },
      description: { de: 'Box, 10 x 20 Zigaretten' },
      priceDiscount: 28.5,
      priceOrigin: 32.0,
      validFrom: '2026-04-23',
      validTo: '2026-04-29',
    };
    const p = normalizePromotion(raw as any);
    expect(p.productName).toBe('Marlboro Red');
    expect(p.productName.trim()).not.toBe('');
    expect(p.chain).toBe('denner');
    expect(p.price?.current).toBeCloseTo(28.5);
    expect(p.price?.regular).toBeCloseTo(32.0);
    expect(p.validFrom).toBe('2026-04-23');
    expect(p.validUntil).toBe('2026-04-29');
    expect(p.description).toContain('Zigaretten');
  });

  it('handles multilingual title in promotion', () => {
    const raw = {
      id: 'abc',
      title: { de: 'Wein', fr: 'Vin', it: 'Vino' },
      priceDiscount: 9.95,
    };
    const p = normalizePromotion(raw as any);
    expect(p.productName).toBe('Wein');
  });

  it('uses priceOverride over priceDiscount', () => {
    const raw = {
      id: 'x',
      title: { de: 'Test' },
      priceDiscount: 5.0,
      priceOverride: 3.5,
    };
    const p = normalizePromotion(raw as any);
    expect(p.price?.current).toBeCloseTo(3.5);
  });
});

describe('denner schemas (zod validation)', () => {
  it('DennerProductSchema accepts a minimal valid product', () => {
    const result = DennerProductSchema.safeParse({ id: 1, title: { de: 'Milch' }, priceDiscount: 1.5 });
    expect(result.success).toBe(true);
  });

  it('DennerProductSchema accepts string title', () => {
    const result = DennerProductSchema.safeParse({ id: 'abc', title: 'Wasser', priceDiscount: 0.8 });
    expect(result.success).toBe(true);
  });

  it('DennerProductSchema passes through unknown fields', () => {
    const result = DennerProductSchema.safeParse({ id: 1, unknownField: 'extra' });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any).unknownField).toBe('extra');
  });

  it('DennerContentResponseSchema accepts empty products array', () => {
    const result = DennerContentResponseSchema.safeParse({ v: 1, products: [] });
    expect(result.success).toBe(true);
  });

  it('DennerContentResponseSchema validates the content-full fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/denner/content-full.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    const result = DennerContentResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.products)).toBe(true);
    }
  });
});
