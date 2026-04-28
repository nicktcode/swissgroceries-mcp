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
});
