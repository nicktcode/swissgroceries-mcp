import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizeStore, normalizePromotion, parseSize } from '../../src/adapters/aldi/normalize.js';
import { AldiProductSchema, AldiSearchResponseSchema } from '../../src/adapters/aldi/schemas.js';

describe('aldi parseSize', () => {
  it('handles 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('handles 1 l with space', () => expect(parseSize('1 l')).toEqual({ value: 1, unit: 'l' }));
  it('handles 250g', () => expect(parseSize('250g')).toEqual({ value: 250, unit: 'g' }));
  it('handles 0.8 kg', () => expect(parseSize('0.8 kg')).toEqual({ value: 0.8, unit: 'kg' }));
  it('handles 500ml', () => expect(parseSize('500ml')).toEqual({ value: 500, unit: 'ml' }));
  it('handles 33cl converts to ml', () => expect(parseSize('33cl')).toEqual({ value: 330, unit: 'ml' }));
  it('handles 6x33cl (picks first number)', () => expect(parseSize('6x33cl')).toBeDefined());
  it('returns undefined for empty string', () => expect(parseSize('')).toBeUndefined());
  it('returns undefined for undefined', () => expect(parseSize(undefined)).toBeUndefined());
});

describe('aldi normalizeProduct', () => {
  it('converts price from rappen to CHF', () => {
    const raw = {
      sku: 'TEST123',
      name: 'Test Produkt',
      price: { amount: 185 },
      sellingSize: '1 l',
    };
    const p = normalizeProduct(raw);
    expect(p.price.current).toBeCloseTo(1.85);
    expect(p.price.currency).toBe('CHF');
  });

  it('populates chain=aldi and id from sku', () => {
    const raw = { sku: 'SKU001', name: 'Foo', price: { amount: 100 } };
    const p = normalizeProduct(raw);
    expect(p.chain).toBe('aldi');
    expect(p.id).toBe('SKU001');
  });

  it('extracts brand from brandName', () => {
    const raw = { sku: 'X', name: 'Y', brandName: 'RETOUR AUX SOURCES', price: { amount: 200 } };
    const p = normalizeProduct(raw);
    expect(p.brand).toBe('RETOUR AUX SOURCES');
  });

  it('derives organic tag from BIO in name', () => {
    const raw = { sku: 'X', name: 'BIO-Milch', price: { amount: 200 } };
    const p = normalizeProduct(raw);
    expect(p.tags).toContain('organic');
  });

  it('computes unitPrice for l product', () => {
    const raw = { sku: 'X', name: 'Milch', price: { amount: 185 }, sellingSize: '1 l' };
    const p = normalizeProduct(raw);
    expect(p.unitPrice).toBeDefined();
    expect(p.unitPrice?.per).toBe('l');
  });
});

describe('aldi normalizeStore', () => {
  it('maps service-point shape correctly', () => {
    const raw = {
      id: 'E220',
      name: 'Hauptstrasse 8',
      address: {
        address1: 'Hauptstrasse 8',
        city: 'Lausen',
        zipCode: '4415',
        latitude: '47.472',
        longitude: '7.75824',
      },
    };
    const s = normalizeStore(raw);
    expect(s.chain).toBe('aldi');
    expect(s.id).toBe('E220');
    expect(s.address.street).toBe('Hauptstrasse 8');
    expect(s.address.zip).toBe('4415');
    expect(s.address.city).toBe('Lausen');
    expect(s.location.lat).toBeCloseTo(47.472);
    expect(s.location.lng).toBeCloseTo(7.75824);
  });
});

describe('aldi normalizePromotion', () => {
  it('populates productName for typical promo input', () => {
    const raw = {
      sku: 'ABC123',
      name: 'Bio Vollmilch',
      price: { amount: 185, wasPriceDisplay: 'CHF 2.10' },
      onSaleDateDisplay: '2026-05-01',
    };
    const p = normalizePromotion(raw);
    expect(p.productName).toBe('Bio Vollmilch');
    expect(p.productName.trim()).not.toBe('');
    expect(p.price?.current).toBeCloseTo(1.85);
    expect(p.validUntil).toBe('2026-05-01');
    expect(p.description).toContain('Was:');
  });

  it('handles missing name gracefully (empty string)', () => {
    const raw = { sku: 'X', price: { amount: 100 } };
    const p = normalizePromotion(raw);
    expect(p.productName).toBe('');
    expect(p.chain).toBe('aldi');
  });
});

describe('aldi normalize fixture', () => {
  it('parses product-detail fixture if present', () => {
    let raw: any;
    try {
      const file = JSON.parse(readFileSync('tests/fixtures/aldi/product-detail.json', 'utf8'));
      raw = file.data ?? file;
    } catch {
      return;
    }
    const p = normalizeProduct(raw);
    expect(p.chain).toBe('aldi');
    expect(p.id).toBe('000000000000525709');
    expect(p.name).toBe('Milch Drink');
    expect(p.price.current).toBeCloseTo(1.85);
  });

  it('parses search-milch fixture if present', () => {
    let data: any[];
    try {
      const file = JSON.parse(readFileSync('tests/fixtures/aldi/search-milch.json', 'utf8'));
      data = file.data ?? file.products ?? [];
    } catch {
      return;
    }
    expect(data.length).toBeGreaterThan(0);
    const p = normalizeProduct(data[0]);
    expect(p.chain).toBe('aldi');
    expect(typeof p.price.current).toBe('number');
  });

  it('parses stores fixture if present', () => {
    let data: any[];
    try {
      const file = JSON.parse(readFileSync('tests/fixtures/aldi/stores.json', 'utf8'));
      data = file.data ?? file.stores ?? [];
    } catch {
      return;
    }
    expect(data.length).toBeGreaterThan(0);
    const s = normalizeStore(data[0]);
    expect(s.chain).toBe('aldi');
    expect(s.id).toBeTruthy();
  });
});

describe('aldi schemas (zod validation)', () => {
  it('AldiProductSchema accepts a minimal valid product', () => {
    const result = AldiProductSchema.safeParse({ sku: 'TEST', name: 'Milch' });
    expect(result.success).toBe(true);
  });

  it('AldiProductSchema passes through unknown fields', () => {
    const result = AldiProductSchema.safeParse({ sku: 'X', unknownField: 42 });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any).unknownField).toBe(42);
  });

  it('AldiSearchResponseSchema accepts empty data array', () => {
    const result = AldiSearchResponseSchema.safeParse({ data: [] });
    expect(result.success).toBe(true);
  });

  it('AldiSearchResponseSchema validates the search-milch fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/aldi/search-milch.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    const result = AldiSearchResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.data ?? result.data.products ?? result.data.results)).toBe(true);
    }
  });
});
