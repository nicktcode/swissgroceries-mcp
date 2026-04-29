import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSize, normalizeProduct, normalizeStore, normalizePromotion } from '../../src/adapters/lidl/normalize.js';
import { LidlProductSchema, LidlCampaignSchema, LidlCampaignGroupsSchema } from '../../src/adapters/lidl/schemas.js';

describe('lidl parseSize', () => {
  it('handles 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('handles 500g', () => expect(parseSize('500g')).toEqual({ value: 500, unit: 'g' }));
  it('handles 1.5kg', () => expect(parseSize('1.5kg')).toEqual({ value: 1.5, unit: 'kg' }));
  it('handles 25cl', () => expect(parseSize('25cl')).toEqual({ value: 250, unit: 'ml' }));
  it('handles 6er', () => expect(parseSize('6er')).toEqual({ value: 6, unit: 'piece' }));
  it('returns undefined for no match', () => expect(parseSize('keine Angabe')).toBeUndefined());
  it('returns undefined for undefined input', () => expect(parseSize(undefined)).toBeUndefined());
});

describe('lidl normalizeProduct', () => {
  it('produces chain=lidl with unitPrice (mainPrice format)', () => {
    const p = normalizeProduct({
      id: '10091030_10050172',
      title: 'Milch',
      mainPrice: { price: 1.5, oldPrice: 1.8 },
      subtitle: '1L',
    } as any);
    expect(p.chain).toBe('lidl');
    expect(p.id).toBe('10091030_10050172');
    expect(p.price.current).toBeCloseTo(1.5);
    expect(p.price.regular).toBeCloseTo(1.8);
    expect(p.price.currency).toBe('CHF');
    expect(p.unitPrice?.value).toBeCloseTo(1.5);
    expect(p.unitPrice?.per).toBe('l');
  });

  it('derives swiss-made tag from name', () => {
    const p = normalizeProduct({ id: '1', title: 'Schweizer Käse', mainPrice: { price: 3 } } as any);
    expect(p.tags).toContain('swiss-made');
  });

  it('falls back to imageUrls array (product detail format)', () => {
    const url = 'https://example.com/img.jpg';
    const p = normalizeProduct({ id: '1', title: 'Test', imageUrls: [url], mainPrice: { price: 1 } } as any);
    expect(p.imageUrl).toBe(url);
  });

  it('uses imageUrl when present (campaign list format)', () => {
    const url = 'https://example.com/img.jpg';
    const p = normalizeProduct({ id: '1', title: 'Test', imageUrl: url, mainPrice: { price: 1 } } as any);
    expect(p.imageUrl).toBe(url);
  });

  it('omits empty brand string', () => {
    const p = normalizeProduct({ id: '1', title: 'Test', brand: '', mainPrice: { price: 1 } } as any);
    expect(p.brand).toBeUndefined();
  });
});

describe('lidl normalizeStore', () => {
  it('maps v2/CH store fields correctly', () => {
    const raw = {
      storeKey: 'CH0149',
      name: 'Wettingen (Fil.Nr. 0149)',
      address: 'Schwimmbadstrasse 29',
      postalCode: '5430',
      locality: 'Wettingen',
      location: { latitude: 47.46167, longitude: 8.31073 },
    };
    const s = normalizeStore(raw);
    expect(s.chain).toBe('lidl');
    expect(s.id).toBe('CH0149');
    expect(s.name).toBe('Wettingen (Fil.Nr. 0149)');
    expect(s.address.street).toBe('Schwimmbadstrasse 29');
    expect(s.address.zip).toBe('5430');
    expect(s.address.city).toBe('Wettingen');
    expect(s.location.lat).toBeCloseTo(47.46167);
    expect(s.location.lng).toBeCloseTo(8.31073);
  });
});

describe('lidl normalizePromotion', () => {
  it('maps mainPrice to promotion price', () => {
    const raw = {
      id: 'p1',
      title: 'Rotwein',
      mainPrice: { price: 4.99, oldPrice: 6.5 },
    };
    const promo = normalizePromotion(raw);
    expect(promo.chain).toBe('lidl');
    expect(promo.productId).toBe('p1');
    expect(promo.productName).toBe('Rotwein');
    expect(promo.price?.current).toBeCloseTo(4.99);
    expect(promo.price?.regular).toBeCloseTo(6.5);
    expect(promo.price?.currency).toBe('CHF');
  });

  it('populates productName for typical promo input', () => {
    const raw = {
      id: '10091030_10050172',
      title: 'Schweizer Rohschinken',
      subtitle: '150g',
      mainPrice: { price: 3.49, oldPrice: 4.99 },
    };
    const promo = normalizePromotion(raw as any);
    expect(promo.productName).toBe('Schweizer Rohschinken');
    expect(promo.productName.trim()).not.toBe('');
    expect(promo.price?.current).toBeCloseTo(3.49);
    expect(promo.price?.regular).toBeCloseTo(4.99);
  });

  it('falls back through name fields when title absent', () => {
    const raw = { id: 'x', mainPrice: { price: 1.0 } };
    const promo = normalizePromotion(raw as any);
    expect(promo.productName).toBe('');
    expect(promo.chain).toBe('lidl');
  });
});

describe('lidl schemas (zod validation)', () => {
  it('LidlProductSchema accepts a minimal valid product', () => {
    const result = LidlProductSchema.safeParse({ id: '1', title: 'Milch', mainPrice: { price: 1.5 } });
    expect(result.success).toBe(true);
  });

  it('LidlProductSchema passes through unknown fields', () => {
    const result = LidlProductSchema.safeParse({ id: '1', unknownField: 'extra' });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any).unknownField).toBe('extra');
  });

  it('LidlCampaignSchema accepts a campaign with products', () => {
    const result = LidlCampaignSchema.safeParse({
      id: '10091030',
      title: 'Dauerhaft günstiger',
      products: [{ id: 'p1', title: 'Milch', mainPrice: { price: 1.5 } }],
    });
    expect(result.success).toBe(true);
  });

  it('LidlCampaignGroupsSchema validates the campaignGroups fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/lidl/campaignGroups.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    const result = LidlCampaignGroupsSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.groups)).toBe(true);
    }
  });
});
