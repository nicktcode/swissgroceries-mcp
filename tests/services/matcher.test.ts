import { describe, it, expect } from 'vitest';
import { matchProduct, isCanonical, effectiveCost } from '../../src/services/matcher.js';
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

  it('rejects Pflegebad (bath product) for milch query via isCanonical', () => {
    const pflegebad: NormalizedProduct = {
      chain: 'aldi', id: '1', name: 'Pflegebad, Milch & Honig',
      price: { current: 1.55, currency: 'CHF' },
      category: ['Drogerie', 'Pflege'],
      tags: [],
    };
    const milk: NormalizedProduct = {
      chain: 'aldi', id: '2', name: 'Vollmilch UHT 1L',
      price: { current: 1.85, currency: 'CHF' },
      size: { value: 1, unit: 'l' },
      unitPrice: { value: 1.85, per: 'l' },
      category: ['Milchprodukte'],
      tags: [],
    };
    // matchProduct may return either (no NEG filter in scorer now)
    // but isCanonical correctly discriminates them
    expect(isCanonical(pflegebad, { query: 'milch' })).toBe(false);
    expect(isCanonical(milk, { query: 'milch' })).toBe(true);
  });

  it('prefers a category-matching milk over a chocolate with "Milch" in name', () => {
    const choc: NormalizedProduct = {
      chain: 'aldi', id: 'choc', name: 'Tafelschokolade Milch',
      price: { current: 1.79, currency: 'CHF' },
      size: { value: 200, unit: 'g' },
      unitPrice: { value: 8.95, per: 'kg' },
      category: ['Süsswaren'],
      tags: [],
    };
    const milk: NormalizedProduct = {
      chain: 'aldi', id: 'milk', name: 'Vollmilch UHT 1L',
      price: { current: 1.85, currency: 'CHF' },
      size: { value: 1, unit: 'l' },
      unitPrice: { value: 1.85, per: 'l' },
      category: ['Milchprodukte'],
      tags: [],
    };
    // Category bonus in scorer still lifts milk above chocolate within the same chain
    const m = matchProduct({ query: 'milch' }, [choc, milk]);
    expect(m?.id).toBe('milk');
    // isCanonical confirms: milk is canonical, chocolate is not
    expect(isCanonical(milk, { query: 'milch' })).toBe(true);
    expect(isCanonical(choc, { query: 'milch' })).toBe(false);
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

  it('expands "pasta" to match Spaghetti, Penne, Hörnli', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'coop', id: 'sp', name: 'Barilla Spaghetti No. 5',
        brand: 'Barilla',
        price: { current: 2.5, currency: 'CHF' },
        size: { value: 500, unit: 'g' },
        unitPrice: { value: 5.0, per: 'kg' },
        category: ['Spaghetti'],
        tags: [],
      },
      {
        chain: 'coop', id: 'pn', name: 'Barilla Penne Rigate No. 73',
        brand: 'Barilla',
        price: { current: 2.5, currency: 'CHF' },
        size: { value: 500, unit: 'g' },
        unitPrice: { value: 5.0, per: 'kg' },
        category: ['Penne & Röhren'],
        tags: [],
      },
      {
        chain: 'coop', id: 'pg', name: 'Prix Garantie Spaghetti',
        price: { current: 1.2, currency: 'CHF' },
        size: { value: 500, unit: 'g' },
        unitPrice: { value: 2.4, per: 'kg' },
        category: ['Spaghetti'],
        tags: ['budget'],
      },
    ];
    const m = matchProduct({ query: 'pasta' }, products);
    // Cheapest by unit price among matched candidates → Prix Garantie
    expect(m?.id).toBe('pg');
  });

  it('expands "milch" to match Vollmilch and Milchdrink', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'aldi', id: 'a', name: 'Vollmilch UHT',
        price: { current: 1.85, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.85, per: 'l' },
        tags: [],
      },
      {
        chain: 'coop', id: 'b', name: 'Milchdrink Drink 1.5%',
        price: { current: 1.95, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.95, per: 'l' },
        tags: [],
      },
    ];
    const m = matchProduct({ query: 'milch' }, products);
    expect(m?.id).toBe('a'); // cheaper milk
  });

  it('rejects "Apfelschorle" (apple juice) for apfel query via isCanonical', () => {
    const apfelschorle: NormalizedProduct = {
      chain: 'lidl', id: 'js', name: 'Apfelschorle',
      price: { current: 0.55, currency: 'CHF' },
      size: { value: 500, unit: 'ml' },
      unitPrice: { value: 1.10, per: 'l' },
      category: ['Getränke', 'Süssgetränke'],
      tags: [],
    };
    const apples: NormalizedProduct = {
      chain: 'coop', id: 'app', name: 'Äpfel Gala süsslich IP-Suisse',
      price: { current: 1.45, currency: 'CHF' },
      size: { value: 500, unit: 'g' },
      unitPrice: { value: 2.90, per: 'kg' },
      category: ['Obst', 'Äpfel'],
      tags: [],
    };
    // isCanonical: apples are canonical for "apfel", Apfelschorle is not
    expect(isCanonical(apples, { query: 'apfel' })).toBe(true);
    expect(isCanonical(apfelschorle, { query: 'apfel' })).toBe(false);
  });

  it('still matches "Vollmilch" (suffix-head) for milch query', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'migros', id: 'vm', name: 'Vollmilch UHT 1L',
        price: { current: 1.85, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 1.85, per: 'l' },
        tags: [],
      },
    ];
    const m = matchProduct({ query: 'milch' }, products);
    expect(m?.id).toBe('vm');
  });

  it('expands "mandelmilch" to match Mandeldrink', () => {
    const products: NormalizedProduct[] = [
      {
        chain: 'coop', id: 'md', name: 'Alpro Mandeldrink Original',
        brand: 'Alpro',
        price: { current: 2.95, currency: 'CHF' },
        size: { value: 1, unit: 'l' },
        unitPrice: { value: 2.95, per: 'l' },
        tags: ['vegan'],
      },
    ];
    const m = matchProduct({ query: 'mandelmilch' }, products);
    expect(m?.id).toBe('md');
  });

  it('does not let a size-less cheap pack beat a unit-priced candidate within a chain', () => {
    // Regression: a small pack with no parsed size (so no unitPrice) used to win
    // purely because its absolute pack price (1.60) was a smaller number than a
    // proper CHF/kg unit price (9.50). The unit-priced product must win.
    const sizeless: NormalizedProduct = {
      chain: 'migros', id: 'sizeless', name: 'Poulet',
      price: { current: 1.6, currency: 'CHF' },
      tags: [],
    };
    const unitPriced: NormalizedProduct = {
      chain: 'migros', id: 'unit', name: 'Poulet',
      price: { current: 9.5, currency: 'CHF' },
      size: { value: 1, unit: 'kg' },
      unitPrice: { value: 9.5, per: 'kg' },
      tags: [],
    };
    const m = matchProduct({ query: 'poulet' }, [sizeless, unitPriced]);
    expect(m?.id).toBe('unit');
  });

  // Chantier de fond #2 (matching divergence plan_shopping vs search_products):
  // compound-word DE substring matching is one-way, so some queries that
  // search_products resolves get nulled by plan_shopping. Out of scope for the
  // quick-win PR — tracked here so it isn't lost.
  it.todo('unifies plan_shopping and search_products matching for DE compound words');
});

describe('isCanonical', () => {
  it('returns true when category contains query token', () => {
    const p: NormalizedProduct = {
      chain: 'coop', id: '1', name: 'Prix Garantie Äpfel',
      price: { current: 3.95, currency: 'CHF' },
      category: ['Frische', 'Obst', 'Äpfel'],
      tags: [],
    };
    expect(isCanonical(p, { query: 'apfel' })).toBe(true);
  });

  it('returns false when category is from a different domain', () => {
    const p: NormalizedProduct = {
      chain: 'lidl', id: '2', name: 'Apfelschorle',
      price: { current: 0.55, currency: 'CHF' },
      category: ['Getränke', 'Süssgetränke'],
      tags: [],
    };
    expect(isCanonical(p, { query: 'apfel' })).toBe(false);
  });

  it('expands synonyms for category match (pasta → spaghetti)', () => {
    const p: NormalizedProduct = {
      chain: 'coop', id: '3', name: 'Barilla Spaghetti No. 5',
      price: { current: 2.5, currency: 'CHF' },
      category: ['Spaghetti'],
      tags: [],
    };
    expect(isCanonical(p, { query: 'pasta' })).toBe(true);
  });

  it('returns false when product has no category', () => {
    const p: NormalizedProduct = {
      chain: 'lidl', id: '4', name: 'Whatever',
      price: { current: 1, currency: 'CHF' },
      category: [],
      tags: [],
    };
    expect(isCanonical(p, { query: 'milch' })).toBe(false);
  });

  it('user explicit query for "apfelschorle" matches via category text', () => {
    const p: NormalizedProduct = {
      chain: 'coop', id: '5', name: 'Prix Garantie Apfelschorle',
      price: { current: 1.4, currency: 'CHF' },
      category: ['Getränke', 'Süssgetränke', 'Apfelschorle'],
      tags: [],
    };
    expect(isCanonical(p, { query: 'apfelschorle' })).toBe(true);
  });
});

describe('effectiveCost', () => {
  const mince = (over: Partial<NormalizedProduct> = {}): NormalizedProduct => ({
    chain: 'coop', id: 'x', name: 'Hackfleisch',
    price: { current: 5, currency: 'CHF' },
    size: { value: 500, unit: 'g' },
    unitPrice: { value: 10, per: 'kg' },
    tags: [],
    ...over,
  });

  it('no need → legacy: one pack at pack price, not sized', () => {
    const c = effectiveCost(mince(), { query: 'hack' });
    expect(c).toEqual({ chf: 5, packs: 1, sized: false });
  });

  it('no need but quantity → quantity packs at pack price', () => {
    const c = effectiveCost(mince(), { query: 'hack', quantity: 3 });
    expect(c).toEqual({ chf: 15, packs: 3, sized: false });
  });

  it('need honoured via adapter size, rounding packs up', () => {
    // 500 g pack, need 1.2 kg → ceil(1200/500) = 3 packs = 15 CHF.
    const c = effectiveCost(mince(), { query: 'hack', need: { amount: 1.2, unit: 'kg' } });
    expect(c).toEqual({ chf: 15, packs: 3, sized: true });
  });

  it('need exactly one pack stays one pack', () => {
    const c = effectiveCost(mince(), { query: 'hack', need: { amount: 500, unit: 'g' } });
    expect(c).toEqual({ chf: 5, packs: 1, sized: true });
  });

  it('need below one pack still buys one pack (ceil floor of 1)', () => {
    const c = effectiveCost(mince(), { query: 'hack', need: { amount: 100, unit: 'g' } });
    expect(c).toEqual({ chf: 5, packs: 1, sized: true });
  });

  it('derives pack size from price ÷ unit price when size is absent', () => {
    // No `size`; unitPrice 10/kg at 5 CHF ⇒ 0.5 kg pack. Need 1 kg → 2 packs.
    const p = mince({ size: undefined });
    const c = effectiveCost(p, { query: 'hack', need: { amount: 1, unit: 'kg' } });
    expect(c).toEqual({ chf: 10, packs: 2, sized: true });
  });

  it('prefers adapter size over derived size when they disagree', () => {
    // size says 500 g; a stale unitPrice would derive 1 kg. `size` must win.
    const p = mince({ size: { value: 500, unit: 'g' }, unitPrice: { value: 5, per: 'kg' } });
    const c = effectiveCost(p, { query: 'hack', need: { amount: 1, unit: 'kg' } });
    expect(c.packs).toBe(2); // ceil(1000/500), not ceil(1000/1000)
    expect(c.sized).toBe(true);
  });

  it('falls back to legacy when need dimension mismatches the pack unit', () => {
    // Need volume, product measured in mass → cannot honour; legacy one pack.
    const c = effectiveCost(mince(), { query: 'hack', need: { amount: 1, unit: 'l' } });
    expect(c).toEqual({ chf: 5, packs: 1, sized: false });
  });

  it('falls back to legacy when neither size nor unit price is known', () => {
    const p = mince({ size: undefined, unitPrice: undefined });
    const c = effectiveCost(p, { query: 'hack', need: { amount: 1, unit: 'kg' } });
    expect(c).toEqual({ chf: 5, packs: 1, sized: false });
  });

  it('handles piece-based needs', () => {
    const eggs: NormalizedProduct = {
      chain: 'migros', id: 'e', name: 'Eier 6er',
      price: { current: 3, currency: 'CHF' },
      size: { value: 6, unit: 'piece' },
      unitPrice: { value: 0.5, per: 'piece' },
      tags: [],
    };
    // Need 10 eggs → ceil(10/6) = 2 packs = 6 CHF.
    const c = effectiveCost(eggs, { query: 'eier', need: { amount: 10, unit: 'piece' } });
    expect(c).toEqual({ chf: 6, packs: 2, sized: true });
  });
});

describe('matchProduct with a need', () => {
  // Two same-chain offers that score identically for the query but differ in
  // pack size. The intra-chain pick should honour the need (cheapest to cover),
  // not just the best CHF/kg — so the chain hands the cross-chain step its best
  // representative for the requested amount.
  const mince: NormalizedProduct[] = [
    {
      chain: 'coop', id: 'big', name: 'Hackfleisch 1kg',
      price: { current: 10, currency: 'CHF' },
      size: { value: 1, unit: 'kg' }, unitPrice: { value: 10, per: 'kg' }, tags: [],
    },
    {
      chain: 'coop', id: 'small', name: 'Hackfleisch 400g',
      price: { current: 5, currency: 'CHF' },
      size: { value: 400, unit: 'g' }, unitPrice: { value: 12.5, per: 'kg' }, tags: [],
    },
  ];

  it('without a need, picks the better unit price (1 kg pack)', () => {
    expect(matchProduct({ query: 'hackfleisch' }, mince)?.id).toBe('big');
  });

  it('with a need, picks the pack cheapest to cover it', () => {
    // 1.2 kg need: 1 kg pack → 2 packs = 20.–; 400 g pack → 3 packs = 15.–.
    expect(
      matchProduct({ query: 'hackfleisch', need: { amount: 1.2, unit: 'kg' } }, mince)?.id,
    ).toBe('small');
  });

  it('falls back to unit-aware price when candidates cannot be sized', () => {
    const unsized: NormalizedProduct[] = [
      { chain: 'coop', id: 'a', name: 'Hackfleisch', price: { current: 3, currency: 'CHF' }, tags: [] },
      { chain: 'coop', id: 'b', name: 'Hackfleisch', price: { current: 2, currency: 'CHF' }, tags: [] },
    ];
    expect(
      matchProduct({ query: 'hackfleisch', need: { amount: 1, unit: 'kg' } }, unsized)?.id,
    ).toBe('b');
  });
});
