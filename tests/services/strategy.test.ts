import { describe, it, expect } from 'vitest';
import { solve } from '../../src/services/strategy.js';
import type { Chain, NormalizedProduct } from '../../src/adapters/types.js';
import type { ShoppingItem } from '../../src/services/matcher.js';

function p(chain: Chain, id: string, name: string, price: number): NormalizedProduct {
  return {
    chain, id, name,
    price: { current: price, currency: 'CHF' },
    tags: [],
  };
}

const items: ShoppingItem[] = [
  { query: 'milk' },
  { query: 'bread' },
  { query: 'eggs' },
];

const matrix: Record<string, Record<Chain, NormalizedProduct | null>> = {
  milk: {
    migros: p('migros', 'm1', 'milk', 1.5),
    coop:   p('coop',   'c1', 'milk', 1.6),
    aldi:   p('aldi',   'a1', 'milk', 1.4),
    denner: null,
    lidl:   null,
  },
  bread: {
    migros: p('migros', 'm2', 'bread', 2.0),
    coop:   p('coop',   'c2', 'bread', 1.8),
    aldi:   null,
    denner: null,
    lidl:   null,
  },
  eggs: {
    migros: p('migros', 'm3', 'eggs', 4.5),
    coop:   p('coop',   'c3', 'eggs', 4.0),
    aldi:   p('aldi',   'a3', 'eggs', 3.5),
    denner: null,
    lidl:   null,
  },
};

describe('solve', () => {
  it('single_store picks the chain with min total over available items', () => {
    const r = solve('single_store', items, matrix, { splitPenaltyChf: 2 });
    expect(r.stops.length).toBe(1);
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.totalChf).toBeCloseTo(7.4, 2);
    expect(r.unmatchedItems).toEqual([]);
  });

  it('split_cart picks cheapest per item plus penalty', () => {
    const r = solve('split_cart', items, matrix, { splitPenaltyChf: 2 });
    expect(r.totalChf).toBeCloseTo(8.7, 2);
    expect(r.stops.length).toBe(2);
  });

  it('absolute_cheapest = split_cart with zero penalty', () => {
    const r = solve('absolute_cheapest', items, matrix, { splitPenaltyChf: 0 });
    expect(r.totalChf).toBeCloseTo(6.7, 2);
  });

  it('records items unavailable everywhere as unmatched', () => {
    const reducedMatrix = { milk: matrix.milk, bread: matrix.bread, butter: {
      migros: null, coop: null, aldi: null, denner: null, lidl: null,
    }};
    const r = solve('split_cart', [...items.slice(0, 2), { query: 'butter' }], reducedMatrix as any, { splitPenaltyChf: 2 });
    expect(r.unmatchedItems).toHaveLength(1);
    expect(r.unmatchedItems[0].query).toBe('butter');
  });

  it('keeps a pinned product in multi-stop plans even when a stand-in is cheaper', () => {
    const pinnedItems: ShoppingItem[] = [{ query: 'milk', preferredProductId: { chain: 'coop', id: 'c1' } }];
    const pinnedMatrix = { 'coop:c1': matrix.milk };
    const r = solve('absolute_cheapest', pinnedItems, pinnedMatrix as any, { splitPenaltyChf: 0 });
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.stops[0].items[0].matched.id).toBe('c1');
  });

  it('single_store uses a stand-in for a product pinned at another chain', () => {
    const pinnedItems: ShoppingItem[] = [
      { query: 'milk', preferredProductId: { chain: 'aldi', id: 'a1' } },
      { query: 'bread' },
      { query: 'eggs' },
    ];
    const pinnedMatrix = { 'aldi:a1': matrix.milk, bread: matrix.bread, eggs: matrix.eggs };
    const r = solve('single_store', pinnedItems, pinnedMatrix as any, { splitPenaltyChf: 2 });
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.unmatchedItems).toEqual([]);
    expect(r.stops[0].items.map((l) => l.matched.id)).toEqual(['c1', 'c2', 'c3']);
  });
});
