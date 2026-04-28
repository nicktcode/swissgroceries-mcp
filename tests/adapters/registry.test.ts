import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

function fakeAdapter(chain: any, caps: Partial<any> = {}): StoreAdapter {
  return {
    chain,
    capabilities: {
      productSearch: false, productDetail: false, storeSearch: false,
      promotions: false, perStoreStock: false, perStorePricing: false,
      ...caps,
    },
    searchProducts: async () => ({ ok: true, data: [] }),
    getProduct: async () => ({ ok: true, data: null }),
    searchStores: async () => ({ ok: true, data: [] }),
    getPromotions: async () => ({ ok: true, data: [] }),
  };
}

describe('AdapterRegistry', () => {
  it('registers and lists adapters', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros', { productSearch: true }));
    expect(r.list().map((a) => a.chain)).toEqual(['migros']);
  });

  it('filters by chain', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros'));
    r.register(fakeAdapter('coop'));
    const got = r.list(['coop']);
    expect(got.map((a) => a.chain)).toEqual(['coop']);
  });

  it('filters by capability', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros', { productSearch: true }));
    r.register(fakeAdapter('lidl',   { productSearch: false, promotions: true }));
    const searchable = r.withCapability('productSearch');
    expect(searchable.map((a) => a.chain)).toEqual(['migros']);
  });

  it('throws on duplicate registration', () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros'));
    expect(() => r.register(fakeAdapter('migros'))).toThrow(/already registered/);
  });
});
