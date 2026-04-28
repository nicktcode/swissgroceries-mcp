import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { getProductHandler } from '../../src/tools/get_product.js';
import { getPromotionsHandler } from '../../src/tools/get_promotions.js';
import { findStockHandler } from '../../src/tools/find_stock.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

function full(chain: any): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: true, perStoreStock: true, perStorePricing: false },
    async searchProducts() { return { ok: true, data: [] }; },
    async getProduct(id) { return { ok: true, data: { chain, id, name: 'p', price: { current: 1, currency: 'CHF' }, tags: [] } }; },
    async searchStores() { return { ok: true, data: [] }; },
    async getPromotions() { return { ok: true, data: [{ chain, productName: 'milk' }] }; },
    async findStoresWithStock() { return { ok: true, data: [] }; },
  };
}

describe('simple tools', () => {
  it('get_product returns the product', async () => {
    const r = new AdapterRegistry(); r.register(full('migros'));
    const p = await getProductHandler(r, { chain: 'migros', id: '1' });
    expect(p?.id).toBe('1');
  });

  it('get_promotions aggregates across chains', async () => {
    const r = new AdapterRegistry(); r.register(full('migros')); r.register(full('coop'));
    const out = await getPromotionsHandler(r, {});
    expect(out.length).toBe(2);
  });

  it('find_stock calls the chain adapter', async () => {
    const r = new AdapterRegistry(); r.register(full('migros'));
    const out = await findStockHandler(r, { chain: 'migros', productId: '1' });
    expect(Array.isArray(out)).toBe(true);
  });
});
