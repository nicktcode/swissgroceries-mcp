import { describe, it, expect } from 'vitest';
import { findStoresHandler, findStoresSchema } from '../../src/tools/find_stores.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

const fakeAdapter: StoreAdapter = {
  chain: 'migros',
  capabilities: { productSearch: false, productDetail: false, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
  async searchProducts() { return { ok: true, data: [] }; },
  async getProduct() { return { ok: true, data: null }; },
  async searchStores(q) {
    return {
      ok: true,
      data: [{
        chain: 'migros', id: '1', name: 'Migros Limmatplatz',
        address: { street: '', zip: '8005', city: 'Zürich' },
        location: { lat: 47.385, lng: 8.527 },
      }],
    };
  },
  async getPromotions() { return { ok: true, data: [] }; },
};

describe('find_stores tool', () => {
  it('validates input', () => {
    expect(() => findStoresSchema.parse({ near: { zip: '8001' } })).not.toThrow();
    expect(() => findStoresSchema.parse({ near: 'invalid' })).toThrow();
  });

  it('resolves zip + filters by radius', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter);
    const out = await findStoresHandler(r, { near: { zip: '8001' }, radiusKm: 5 });
    expect(out.length).toBe(1);
    expect(out[0].chain).toBe('migros');
  });

  it('returns empty array on unknown zip', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter);
    await expect(
      findStoresHandler(r, { near: { zip: '9999' }, radiusKm: 5 }),
    ).rejects.toThrow(/unknown_zip/);
  });
});
