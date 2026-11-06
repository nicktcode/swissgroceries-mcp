import { describe, it, expect } from 'vitest';
import { searchProductsHandler } from '../../src/tools/search_products.js';

const product = (id: string, price: number) => ({
  chain: 'migros', id, name: `P${id}`, price: { current: price, currency: 'CHF' }, tags: [],
}) as any;

const registry = {
  withCapability: () => [{
    chain: 'migros',
    searchProducts: async () => ({ ok: true, data: [product('1', 0), product('2', 4.5)] }),
  }],
} as any;

describe('search_products unpriced products', () => {
  it('drops CHF 0 products by default', async () => {
    const out = await searchProductsHandler(registry, { query: 'cider' });
    expect(out.byChain.migros?.map((p) => p.id)).toEqual(['2']);
  });
  it('keeps them when includeUnpriced is set', async () => {
    const out = await searchProductsHandler(registry, { query: 'cider', includeUnpriced: true });
    expect(out.byChain.migros?.map((p) => p.id)).toEqual(['1', '2']);
  });
});
