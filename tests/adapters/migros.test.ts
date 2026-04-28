import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizeStore, parseSize } from '../../src/adapters/migros/normalize.js';

describe('parseSize', () => {
  it('parses 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('parses 500g', () => expect(parseSize('500g')).toEqual({ value: 500, unit: 'g' }));
  it('parses 1.5kg', () => expect(parseSize('1.5kg')).toEqual({ value: 1.5, unit: 'kg' }));
  it('parses 6er to piece', () => expect(parseSize('6er')).toEqual({ value: 6, unit: 'piece' }));
  it('returns undefined for empty', () => expect(parseSize(undefined)).toBeUndefined());
  it('returns undefined for unparseable', () => expect(parseSize('xyz')).toBeUndefined());
});

describe('normalizeProduct (fixture)', () => {
  it('normalizes a real Migros product', () => {
    let raw: any;
    try {
      raw = JSON.parse(readFileSync('tests/fixtures/migros/product-detail.json', 'utf8'));
    } catch {
      return; // fixture not yet captured — skip silently
    }
    // Real API returns {"0": product, "1": product, ...} — not a products array
    const products = raw.products ?? Object.values(raw);
    if (!products?.[0]) return;
    const p = normalizeProduct(products[0]);
    expect(p.chain).toBe('migros');
    expect(p.id).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(p.price.currency).toBe('CHF');
  });
});

describe('normalizeStore (fixture)', () => {
  it('normalizes a real Migros store', () => {
    let raw: any;
    try {
      raw = JSON.parse(readFileSync('tests/fixtures/migros/stores.json', 'utf8'));
    } catch {
      return; // fixture not yet captured — skip silently
    }
    const stores = Array.isArray(raw) ? raw : (raw.stores ?? []);
    if (!stores[0]) return;
    const s = normalizeStore(stores[0]);
    expect(s.chain).toBe('migros');
    expect(s.id).toBeTruthy();
    expect(s.name).toBeTruthy();
    expect(typeof s.location.lat).toBe('number');
    expect(typeof s.location.lng).toBe('number');
  });
});
