import { describe, it, expect } from 'vitest';
import { plan } from '../../src/services/planner.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { StoreAdapter, NormalizedProduct, NormalizedStore } from '../../src/adapters/types.js';

function fakeStore(chain: any, id: string, lat: number, lng: number): NormalizedStore {
  return {
    chain, id, name: `${chain} ${id}`,
    address: { street: '', zip: '8001', city: 'Zürich' },
    location: { lat, lng },
  };
}

function fakeProduct(chain: any, id: string, name: string, price: number): NormalizedProduct {
  return { chain, id, name, price: { current: price, currency: 'CHF' }, tags: [] };
}

function makeAdapter(chain: any, prods: Record<string, NormalizedProduct>): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts(q) {
      const p = prods[q.query];
      return { ok: true, data: p ? [p] : [] };
    },
    async getProduct() { return { ok: true, data: null }; },
    async searchStores() { return { ok: true, data: [fakeStore(chain, '1', 47.37, 8.54)] }; },
    async getPromotions() { return { ok: true, data: [] }; },
  };
}

describe('plan', () => {
  it('returns a single_store plan favoring chain with full coverage', async () => {
    const r = new AdapterRegistry();
    r.register(makeAdapter('migros', {
      milk: fakeProduct('migros', 'm1', 'milk', 1.5),
      bread: fakeProduct('migros', 'm2', 'bread', 2.0),
    }));
    r.register(makeAdapter('coop', {
      milk: fakeProduct('coop', 'c1', 'milk', 1.6),
    }));

    const result = await plan(r, {
      items: [{ query: 'milk' }, { query: 'bread' }],
      near: { lat: 47.37, lng: 8.54 },
      strategy: 'single_store',
    });

    expect(result.primary.stops.length).toBe(1);
    expect(result.primary.stops[0].store.chain).toBe('migros');
    expect(result.primary.totalChf).toBeCloseTo(3.5, 2);
  });

  it('returns unavailable chains in metadata', async () => {
    const r = new AdapterRegistry();
    const broken: StoreAdapter = {
      chain: 'aldi',
      capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
      async searchProducts() { return { ok: false, error: { code: 'unavailable', reason: 'down' } }; },
      async getProduct() { return { ok: true, data: null }; },
      async searchStores() { return { ok: true, data: [] }; },
      async getPromotions() { return { ok: true, data: [] }; },
    };
    r.register(broken);
    r.register(makeAdapter('migros', { milk: fakeProduct('migros', 'm1', 'milk', 1.5) }));

    const result = await plan(r, {
      items: [{ query: 'milk' }],
      near: { lat: 47.37, lng: 8.54 },
      strategy: 'single_store',
    });

    expect(result.primary.unavailableChains?.find((c) => c.chain === 'aldi')).toBeTruthy();
    expect(result.primary.stops[0].store.chain).toBe('migros');
  });

  it('returns up to 2 alternatives', async () => {
    const r = new AdapterRegistry();
    r.register(makeAdapter('migros', {
      milk: fakeProduct('migros', 'm1', 'milk', 1.5),
      bread: fakeProduct('migros', 'm2', 'bread', 2.0),
    }));
    r.register(makeAdapter('coop', {
      milk: fakeProduct('coop', 'c1', 'milk', 1.4),
      bread: fakeProduct('coop', 'c2', 'bread', 2.5),
    }));

    const result = await plan(r, {
      items: [{ query: 'milk' }, { query: 'bread' }],
      near: { lat: 47.37, lng: 8.54 },
      strategy: 'split_cart',
      splitPenaltyChf: 0.5,
    });

    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});
