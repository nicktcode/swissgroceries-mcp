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
});

describe('solve with a per-item need', () => {
  // Two mince offers for the same line:
  //  - migros: 1 kg pack at 10.– (10.–/kg, the better unit price)
  //  - coop:   400 g pack at  5.– (12.50/kg, the worse unit price)
  // Need is 1.2 kg. migros → ceil(1.2/1)=2 packs = 20.–; coop → ceil(1.2/0.4)=3
  // packs = 15.–. So the worse-per-kg-but-better-fitting pack wins on real cost.
  const mince = {
    migros: {
      chain: 'migros' as Chain, id: 'm', name: 'Hackfleisch 1kg',
      price: { current: 10, currency: 'CHF' as const },
      size: { value: 1, unit: 'kg' as const },
      unitPrice: { value: 10, per: 'kg' as const },
      tags: [],
    },
    coop: {
      chain: 'coop' as Chain, id: 'c', name: 'Hackfleisch 400g',
      price: { current: 5, currency: 'CHF' as const },
      size: { value: 400, unit: 'g' as const },
      unitPrice: { value: 12.5, per: 'kg' as const },
      tags: [],
    },
  };

  it('absolute_cheapest ranks by cost to cover the need, not unit price', () => {
    const item: ShoppingItem = { query: 'mince', need: { amount: 1.2, unit: 'kg' } };
    const r = solve('absolute_cheapest', [item], { mince } as any, { splitPenaltyChf: 0 });
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.stops[0].items[0].lineTotal).toBeCloseTo(15, 2);
    expect(r.stops[0].items[0].packs).toBe(3);
    expect(r.totalChf).toBeCloseTo(15, 2);
  });

  it('without a need, the better unit price wins (regression guard)', () => {
    const item: ShoppingItem = { query: 'mince' };
    const r = solve('absolute_cheapest', [item], { mince } as any, { splitPenaltyChf: 0 });
    expect(r.stops[0].store.chain).toBe('migros');
    expect(r.stops[0].items[0].lineTotal).toBeCloseTo(10, 2);
  });

  it('single_store total reflects the packs needed to cover the need', () => {
    const item: ShoppingItem = { query: 'mince', need: { amount: 1.2, unit: 'kg' } };
    const r = solve('single_store', [item], { mince } as any, { splitPenaltyChf: 2 });
    // coop: 3 packs = 15.–; migros: 2 packs = 20.– → coop is the cheaper single store.
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.totalChf).toBeCloseTo(15, 2);
    expect(r.stops[0].items[0].packs).toBe(3);
  });

  it('a kg need picks a per-kg offer even when per-piece offers are the majority', () => {
    // Regression guard for the dominantPer/dimension interaction: two per-piece
    // offers (cheaper packs) plus one per-kg offer. A kg need must not let the
    // per-piece majority shrink the pool and hide the only candidate that can
    // actually satisfy the need's dimension.
    const offers = {
      migros: {
        chain: 'migros' as Chain, id: 'mp', name: 'Hackbällchen 6 Stück',
        price: { current: 6, currency: 'CHF' as const },
        size: { value: 6, unit: 'piece' as const },
        unitPrice: { value: 1, per: 'piece' as const },
        tags: [],
      },
      aldi: {
        chain: 'aldi' as Chain, id: 'ap', name: 'Hackbällchen 4 Stück',
        price: { current: 4.8, currency: 'CHF' as const },
        size: { value: 4, unit: 'piece' as const },
        unitPrice: { value: 1.2, per: 'piece' as const },
        tags: [],
      },
      coop: {
        chain: 'coop' as Chain, id: 'ck', name: 'Hackfleisch 1kg',
        price: { current: 10, currency: 'CHF' as const },
        size: { value: 1, unit: 'kg' as const },
        unitPrice: { value: 10, per: 'kg' as const },
        tags: [],
      },
    };
    const item: ShoppingItem = { query: 'mince', need: { amount: 1, unit: 'kg' } };
    const r = solve('absolute_cheapest', [item], { mince: offers } as any, { splitPenaltyChf: 0 });
    expect(r.stops[0].store.chain).toBe('coop');
    expect(r.stops[0].items[0].packs).toBe(1);
    expect(r.stops[0].items[0].lineTotal).toBeCloseTo(10, 2);
  });

  it('unsizable need falls back to unit-price pick and honours quantity', () => {
    // Neither offer carries size or unitPrice → the need can't be sized. The
    // solver should pick best-effort by price and use `quantity` as the pack
    // count (matching the schema doc), keeping the total consistent.
    const offers = {
      migros: {
        chain: 'migros' as Chain, id: 'm', name: 'Hackfleisch',
        price: { current: 3, currency: 'CHF' as const }, tags: [],
      },
      aldi: {
        chain: 'aldi' as Chain, id: 'a', name: 'Hackfleisch',
        price: { current: 2, currency: 'CHF' as const }, tags: [],
      },
    };
    const item: ShoppingItem = { query: 'mince', need: { amount: 1, unit: 'kg' }, quantity: 2 };
    const r = solve('absolute_cheapest', [item], { mince: offers } as any, { splitPenaltyChf: 0 });
    expect(r.stops[0].store.chain).toBe('aldi');   // cheaper pack price
    expect(r.stops[0].items[0].packs).toBe(2);     // quantity honoured as fallback
    expect(r.stops[0].items[0].lineTotal).toBeCloseTo(4, 2);
  });
});
