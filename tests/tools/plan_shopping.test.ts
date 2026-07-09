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

// Records the language each searchProducts call receives, so the handler's
// language-resolution glue (explicit override, ZIP inference, coord fallback)
// can be asserted end-to-end.
function capturingAdapter(seen: Array<string | undefined>): StoreAdapter {
  return {
    chain: 'migros',
    capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts(q) {
      seen.push(q.language);
      return { ok: true, data: [{ chain: 'migros', id: 'm', name: 'milk', price: { current: 1.5, currency: 'CHF' as const }, tags: [] }] };
    },
    async getProduct() { return { ok: true, data: null }; },
    async searchStores() {
      return { ok: true, data: [{ chain: 'migros', id: '1', name: 'migros 1', address: { street: '', zip: '', city: '' }, location: { lat: 46.52, lng: 6.63 } }] };
    },
    async getPromotions() { return { ok: true, data: [] }; },
  };
}

describe('plan_shopping language resolution', () => {
  it('passes an explicit language through, overriding what the location would infer', async () => {
    const seen: Array<string | undefined> = [];
    const r = new AdapterRegistry();
    r.register(capturingAdapter(seen));
    await planShoppingHandler(r, {
      items: [{ query: 'milk' }],
      near: { zip: '8001' }, // Zürich would infer 'de'
      strategy: 'single_store',
      language: 'it',
    });
    expect(seen).toContain('it');
  });

  it('infers French from a Romandie ZIP when no language is given', async () => {
    const seen: Array<string | undefined> = [];
    const r = new AdapterRegistry();
    r.register(capturingAdapter(seen));
    await planShoppingHandler(r, {
      items: [{ query: 'milk' }],
      near: { zip: '1003' }, // Lausanne
      strategy: 'single_store',
    });
    expect(seen).toContain('fr');
  });

  it('infers Italian from Ticino coordinates when no language is given', async () => {
    const seen: Array<string | undefined> = [];
    const r = new AdapterRegistry();
    r.register(capturingAdapter(seen));
    await planShoppingHandler(r, {
      items: [{ query: 'milk' }],
      near: { lat: 46.0, lng: 8.95 }, // Lugano
      strategy: 'single_store',
    });
    expect(seen).toContain('it');
  });
});

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
