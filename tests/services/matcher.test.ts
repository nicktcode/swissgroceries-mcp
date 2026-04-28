import { describe, it, expect } from 'vitest';
import { matchProduct } from '../../src/services/matcher.js';
import type { NormalizedProduct } from '../../src/adapters/types.js';

const milkProducts: NormalizedProduct[] = [
  {
    chain: 'migros',
    id: '1',
    name: 'M-Budget Milch UHT 1L',
    price: { current: 1.45, currency: 'CHF' },
    size: { value: 1, unit: 'l' },
    unitPrice: { value: 1.45, per: 'l' },
    tags: ['budget'],
  },
  {
    chain: 'migros',
    id: '2',
    name: 'Bio Vollmilch UHT 1L',
    price: { current: 2.1, currency: 'CHF' },
    size: { value: 1, unit: 'l' },
    unitPrice: { value: 2.1, per: 'l' },
    tags: ['organic'],
  },
  {
    chain: 'migros',
    id: '3',
    name: 'Aktivia Joghurt Milch Pfirsich',
    price: { current: 1.8, currency: 'CHF' },
    size: { value: 500, unit: 'g' },
    tags: [],
  },
];

describe('matchProduct', () => {
  it('returns cheapest by unitPrice when query is generic', () => {
    const m = matchProduct({ query: 'milch' }, milkProducts);
    expect(m?.id).toBe('1');
  });

  it('respects organic tag filter', () => {
    const m = matchProduct(
      { query: 'milch', filters: { tags: ['organic'] } },
      milkProducts,
    );
    expect(m?.id).toBe('2');
  });

  it('respects maxPrice filter', () => {
    const m = matchProduct(
      { query: 'milch', filters: { maxPrice: 2.0 } },
      milkProducts,
    );
    expect(m?.id).toBe('1');
  });

  it('returns null when no candidate scores above threshold', () => {
    const m = matchProduct({ query: 'whisky' }, milkProducts);
    expect(m).toBeNull();
  });

  it('hard-pins to preferredProductId when set and present', () => {
    const m = matchProduct(
      { query: 'milch', preferredProductId: { chain: 'migros', id: '2' } },
      milkProducts,
    );
    expect(m?.id).toBe('2');
  });

  it('returns null when preferredProductId is absent from results', () => {
    const m = matchProduct(
      { query: 'milch', preferredProductId: { chain: 'migros', id: '999' } },
      milkProducts,
    );
    expect(m).toBeNull();
  });

  it('penalizes products that do not contain a query token in name or category', () => {
    const m = matchProduct({ query: 'milch' }, milkProducts);
    expect(m?.id).not.toBe('3');
  });

  it('rejects Pflegebad (bath product) for milch query', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'aldi', id: '1', name: 'Pflegebad, Milch & Honig',
        price: { current: 1.55, currency: 'CHF' },
        tags: [],
      },
      {
        chain: 'aldi', id: '2', name: 'Vollmilch UHT 1L',
        price: { current: 1.85, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.85, per: 'l' },
        tags: [],
      },
    ];
    const m = matchProduct({ query: 'milch' }, products);
    expect(m?.id).toBe('2');
  });

  it('prefers a category-matching milk over a chocolate with "Milch" in name', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'aldi', id: 'choc', name: 'Tafelschokolade Milch',
        price: { current: 1.79, currency: 'CHF' },
        size: { value: 200, unit: 'g' },
        unitPrice: { value: 8.95, per: 'kg' },
        category: ['Süsswaren'],
        tags: [],
      },
      {
        chain: 'aldi', id: 'milk', name: 'Vollmilch UHT 1L',
        price: { current: 1.85, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.85, per: 'l' },
        category: ['Milchprodukte'],
        tags: [],
      },
    ];
    const m = matchProduct({ query: 'milch' }, products);
    expect(m?.id).toBe('milk');
  });

  it('handles brand prefix in the name (M-Budget Milch wins via brand strip)', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'migros', id: 'mb', name: 'M-Budget Milch UHT 1L',
        brand: 'M-Budget',
        price: { current: 1.45, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.45, per: 'l' },
        tags: ['budget'],
      },
      {
        chain: 'migros', id: 'reg', name: 'Vollmilch UHT 1L',
        price: { current: 1.85, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.85, per: 'l' },
        tags: [],
      },
    ];
    const m = matchProduct({ query: 'milch' }, products);
    expect(m?.id).toBe('mb'); // cheaper, both should match well after brand strip
  });
});
