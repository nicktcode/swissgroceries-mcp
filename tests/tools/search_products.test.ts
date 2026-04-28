import { describe, it, expect } from 'vitest';
import { searchProductsHandler, searchProductsSchema } from '../../src/tools/search_products.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

function makeAdapter(chain: any, results: any[]): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: false, storeSearch: false, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts() { return { ok: true, data: results }; },
    async getProduct() { return { ok: true, data: null }; },
    async searchStores() { return { ok: true, data: [] }; },
    async getPromotions() { return { ok: true, data: [] }; },
  };
}

describe('search_products tool', () => {
  it('validates query is non-empty', () => {
    expect(() => searchProductsSchema.parse({ query: '' })).toThrow();
    expect(() => searchProductsSchema.parse({ query: 'milk' })).not.toThrow();
  });

  it('returns results grouped by chain', async () => {
    const r = new AdapterRegistry();
    r.register(makeAdapter('migros', [{ chain: 'migros', id: '1', name: 'milk', price: { current: 1.5, currency: 'CHF' }, tags: [] }]));
    r.register(makeAdapter('coop', []));
    const out = await searchProductsHandler(r, { query: 'milk' });
    expect(out.byChain.migros?.length).toBe(1);
    expect(out.byChain.coop?.length).toBe(0);
  });
});
