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

function makePageableAdapter(chain: any, allResults: any[]): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: false, storeSearch: false, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts(q) {
      const offset = q.offset ?? 0;
      const limit = q.limit ?? 20;
      return { ok: true, data: allResults.slice(offset, offset + limit) };
    },
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

  it('offset is optional and defaults gracefully', () => {
    expect(() => searchProductsSchema.parse({ query: 'milk' })).not.toThrow();
    expect(() => searchProductsSchema.parse({ query: 'milk', offset: 0 })).not.toThrow();
    expect(() => searchProductsSchema.parse({ query: 'milk', offset: -1 })).toThrow();
    expect(() => searchProductsSchema.parse({ query: 'milk', offset: 501 })).toThrow();
  });

  it('offset is passed through and paginates results', async () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      chain: 'migros' as const,
      id: String(i),
      name: `Product ${i}`,
      price: { current: 1.0, currency: 'CHF' as const },
      tags: [] as any[],
    }));
    const r = new AdapterRegistry();
    r.register(makePageableAdapter('migros', products));

    const page1 = await searchProductsHandler(r, { query: 'product', limit: 5, offset: 0 });
    const page2 = await searchProductsHandler(r, { query: 'product', limit: 5, offset: 5 });

    expect(page1.byChain.migros?.length).toBe(5);
    expect(page2.byChain.migros?.length).toBe(5);

    const ids1 = page1.byChain.migros?.map((p) => p.id) ?? [];
    const ids2 = page2.byChain.migros?.map((p) => p.id) ?? [];
    // Pages must not overlap
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });
});
