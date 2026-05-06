import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizeStore, parseSize } from '../../src/adapters/coop/normalize.js';
import { CoopSearchResponseSchema, CoopProductSchema } from '../../src/adapters/coop/schemas.js';

describe('coop parseSize', () => {
  it('handles cl→ml conversion', () => expect(parseSize('33cl')).toEqual({ value: 330, unit: 'ml' }));
  it('handles dl→ml conversion', () => expect(parseSize('5dl')).toEqual({ value: 500, unit: 'ml' }));
  it('handles 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('handles 6er', () => expect(parseSize('6er')).toEqual({ value: 6, unit: 'piece' }));
  it('handles grams', () => expect(parseSize('500g')).toEqual({ value: 500, unit: 'g' }));
  it('handles kg', () => expect(parseSize('1.5kg')).toEqual({ value: 1.5, unit: 'kg' }));
  it('returns undefined for empty string', () => expect(parseSize('')).toBeUndefined());
  it('returns undefined for undefined', () => expect(parseSize(undefined)).toBeUndefined());
  it('returns undefined for non-size text', () => expect(parseSize('Frisch')).toBeUndefined());
});

describe('coop normalizeProduct (unit)', () => {
  it('maps content+contentUnit to size', () => {
    const p = normalizeProduct({ code: '123', name: 'Test', content: '500', contentUnit: 'g', price: { value: 2.5 } });
    expect(p.size).toEqual({ value: 500, unit: 'g' });
    expect(p.chain).toBe('coop');
    expect(p.id).toBe('123');
    expect(p.price.current).toBe(2.5);
    expect(p.price.currency).toBe('CHF');
  });

  it('maps originalPrice to regular price', () => {
    const p = normalizeProduct({
      code: '456', name: 'Discounted',
      price: { value: 5.4 },
      originalPrice: { value: 7.8 },
    });
    expect(p.price.current).toBe(5.4);
    expect(p.price.regular).toBe(7.8);
  });

  it('sets promotion when hasPromotion is true', () => {
    const p = normalizeProduct({ code: '789', name: 'Promo', hasPromotion: true, selectedPromotion: { text: '30%' } });
    expect(p.promotion).toBeDefined();
    expect(p.promotion?.description).toBe('30%');
  });

  it('uses primaryCategory for category', () => {
    const p = normalizeProduct({ code: '001', name: 'Beeren', primaryCategory: { id: 'm_1785', name: 'Beeren' } });
    expect(p.category).toEqual(['Beeren']);
  });

  it('derives vegan tag from boolean flag', () => {
    const p = normalizeProduct({ code: '002', name: 'Tofu', vegan: true });
    expect(p.tags).toContain('vegan');
  });
});

describe('coop normalizeStore (unit)', () => {
  it('maps vstId as store id', () => {
    const s = normalizeStore({
      vstId: '1905',
      name: 'Coop Zürich',
      address: { line1: 'Bahnhofbrücke', line2: '1', postalCode: '8001', town: 'Zürich' },
      geoPoint: { latitude: 47.377, longitude: 8.542 },
    });
    expect(s.id).toBe('1905');
    expect(s.chain).toBe('coop');
    expect(s.address.street).toBe('Bahnhofbrücke 1');
    expect(s.location.lat).toBe(47.377);
  });
});

describe('coop normalize (fixture, optional)', () => {
  it('parses a Coop product fixture if present', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/coop/product-detail.json', 'utf8')); }
    catch { return; }
    if (!raw || raw.errors) return;
    const p = normalizeProduct(raw);
    expect(p.chain).toBe('coop');
    expect(p.id).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(p.price.current).toBeGreaterThan(0);
  });

  it('parses nutrition from the Coop product detail (Schweins Halssteak)', () => {
    // Captured 2026-05-06: /rest/v2/coopathome/products/7431706. Two
    // unmarked "Energie" rows — first kJ (853), second kcal (205); we
    // sort kJ as the larger value.
    const raw = JSON.parse(readFileSync('tests/fixtures/coop/product-detail.json', 'utf8'));
    const p = normalizeProduct(raw);
    expect(p.nutrition).toBeDefined();
    expect(p.nutrition!.basis).toEqual({ value: 100, unit: 'g' });
    expect(p.nutrition!.energyKj).toBe(853);
    expect(p.nutrition!.energyKcal).toBe(205);
    expect(p.nutrition!.fat).toBe(14);
    expect(p.nutrition!.saturatedFat).toBe(5.6);
    expect(p.nutrition!.carbs).toBe(0.7);
    expect(p.nutrition!.sugar).toBe(0.5);
    expect(p.nutrition!.protein).toBe(19);
    expect(p.nutrition!.salt).toBe(1.5);
  });

  it('returns undefined nutrition when the product detail lacks the block', () => {
    const p = normalizeProduct({ code: 'X', name: 'No Nutri', price: { value: 1 } });
    expect(p.nutrition).toBeUndefined();
  });

  it('parses Coop store fixture if present', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/coop/stores.json', 'utf8')); }
    catch { return; }
    if (!raw?.locations?.length) return;
    const s = normalizeStore(raw.locations[0]);
    expect(s.chain).toBe('coop');
    expect(s.id).toBeTruthy();
    expect(s.location.lat).toBeGreaterThan(0);
  });
});

describe('coop schemas (zod validation)', () => {
  it('CoopProductSchema accepts a minimal valid product', () => {
    const result = CoopProductSchema.safeParse({ code: '123', name: 'Milch' });
    expect(result.success).toBe(true);
  });

  it('CoopProductSchema accepts a product with all common fields', () => {
    const product = {
      code: '456',
      name: 'Bio Vollmilch',
      brand: { name: 'M-Budget' },
      price: { value: 1.5, formattedValue: 'CHF 1.50' },
      originalPrice: { value: 2.0 },
      content: '1',
      contentUnit: 'l',
      images: [{ url: 'https://example.com/image.jpg' }],
      primaryCategory: { id: 'dairy', name: 'Milchprodukte' },
      vegan: false,
      vegetarian: true,
      hasPromotion: false,
    };
    const result = CoopProductSchema.safeParse(product);
    expect(result.success).toBe(true);
  });

  it('CoopProductSchema passes through unknown fields (passthrough)', () => {
    const result = CoopProductSchema.safeParse({ code: '789', unknownField: 'extra' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).unknownField).toBe('extra');
    }
  });

  it('CoopSearchResponseSchema validates the search-milch fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/coop/search-milch.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    const result = CoopSearchResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.products)).toBe(true);
    }
  });

  it('CoopSearchResponseSchema accepts empty products array', () => {
    const result = CoopSearchResponseSchema.safeParse({ products: [] });
    expect(result.success).toBe(true);
  });
});
