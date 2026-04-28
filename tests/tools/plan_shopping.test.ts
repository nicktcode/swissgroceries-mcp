import { describe, it, expect } from 'vitest';
import { planShoppingHandler, planShoppingSchema } from '../../src/tools/plan_shopping.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

function adapter(chain: any, milkPrice: number, breadPrice: number): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts(q) {
      const data = q.query === 'milk'
        ? [{ chain, id: 'm', name: 'milk', price: { current: milkPrice, currency: 'CHF' as const }, tags: [] }]
        : q.query === 'bread'
          ? [{ chain, id: 'b', name: 'bread', price: { current: breadPrice, currency: 'CHF' as const }, tags: [] }]
          : [];
      return { ok: true, data };
    },
    async getProduct() { return { ok: true, data: null }; },
    async searchStores() {
      return { ok: true, data: [{ chain, id: '1', name: `${chain} 1`, address: { street: '', zip: '8001', city: 'Zürich' }, location: { lat: 47.37, lng: 8.54 } }] };
    },
    async getPromotions() { return { ok: true, data: [] }; },
  };
}

describe('plan_shopping tool', () => {
  it('returns a plan with primary and alternatives', async () => {
    const r = new AdapterRegistry();
    r.register(adapter('migros', 1.5, 2.0));
    r.register(adapter('coop', 1.7, 1.8));
    const out = await planShoppingHandler(r, {
      items: [{ query: 'milk' }, { query: 'bread' }],
      near: { zip: '8001' },
      strategy: 'split_cart',
    });
    expect(out.primary).toBeDefined();
    expect(out.primary.totalChf).toBeGreaterThan(0);
  });

  it('rejects empty items array', () => {
    expect(() => planShoppingSchema.parse({
      items: [], near: { zip: '8001' }, strategy: 'single_store',
    })).toThrow();
  });
});
