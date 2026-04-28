import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeProduct, normalizeStore, parseSize } from '../../src/adapters/migros/normalize.js';
import { MigrosProductDetailSchema, MigrosProductDetailsResponseSchema } from '../../src/adapters/migros/schemas.js';

describe('migros normalize variable-weight produce', () => {
  it('derives price from unitPrice × quantity when effectiveValue is missing', () => {
    const raw: any = {
      uid: '12345',
      name: 'Äpfel Gala',
      offer: {
        quantity: '1 kg',
        isVariableWeight: true,
        price: {
          unitPrice: { value: 0.28, unit: '100g' },
          // no effectiveValue
        },
      },
    };
    const p = normalizeProduct(raw);
    expect(p.price.current).toBeCloseTo(2.80, 2);
  });

  it('keeps explicit effectiveValue when present', () => {
    const raw: any = {
      uid: '12346',
      name: 'M-Budget Milch UHT 1L',
      offer: {
        quantity: '1 l',
        price: {
          effectiveValue: 1.45,
          advertisedValue: 1.45,
          unitPrice: { value: 1.45, unit: '1l' },
        },
      },
    };
    const p = normalizeProduct(raw);
    expect(p.price.current).toBe(1.45);
  });
});

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

describe('migros schemas (zod validation)', () => {
  it('MigrosProductDetailSchema accepts a minimal product', () => {
    const result = MigrosProductDetailSchema.safeParse({ uid: 123, name: 'Vollmilch' });
    expect(result.success).toBe(true);
  });

  it('MigrosProductDetailSchema accepts a product with offer.price fields', () => {
    const product = {
      uid: 100006357,
      migrosId: '204003200000',
      name: 'Vollmilch',
      offer: {
        price: { effectiveValue: 1.45, advertisedValue: 1.45 },
        quantity: '1 l',
        isVariableWeight: false,
      },
      breadcrumb: [{ id: 'dairy', name: 'Milchprodukte' }],
    };
    const result = MigrosProductDetailSchema.safeParse(product);
    expect(result.success).toBe(true);
  });

  it('MigrosProductDetailSchema passes through unknown fields', () => {
    const result = MigrosProductDetailSchema.safeParse({ uid: 1, extraField: 'surprise' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extraField).toBe('surprise');
    }
  });

  it('MigrosProductDetailsResponseSchema validates the product-detail fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/migros/product-detail.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    // Fixture is an array of products
    const result = MigrosProductDetailsResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('MigrosProductDetailsResponseSchema accepts record-keyed response', () => {
    const det = {
      '0': { uid: 1, name: 'Product A', offer: { price: { effectiveValue: 2.5 } } },
      '1': { uid: 2, name: 'Product B' },
    };
    const result = MigrosProductDetailsResponseSchema.safeParse(det);
    expect(result.success).toBe(true);
  });
});
