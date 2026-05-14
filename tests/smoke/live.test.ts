import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../../src/index.js';
import { searchProductsHandler } from '../../src/tools/search_products.js';
import type { SearchProductsOutput } from '../../src/tools/search_products.js';
import { findStoresHandler } from '../../src/tools/find_stores.js';
import { planShoppingHandler } from '../../src/tools/plan_shopping.js';
import { getPromotionsHandler } from '../../src/tools/get_promotions.js';
import type { Chain } from '../../src/adapters/types.js';

const RUN = process.env.RUN_LIVE === '1';
const itLive = RUN ? it : it.skip;

/**
 * Assert that a chain returned products from a live search.
 *
 * An empty result is only a real failure if the chain DIDN'T report an
 * upstream outage. If the chain errored with `unavailable` or `rate_limited`,
 * that's the upstream's fault, not an adapter break — skip the test so the
 * nightly smoke doesn't file a false `adapter-broken` issue. Empty-with-no-error
 * or `schema_mismatch` still fails hard: those signal a genuine adapter bug.
 */
function expectChainProducts(
  out: SearchProductsOutput,
  chain: Chain,
  ctx: { skip: (note?: string) => void },
): void {
  const count = out.byChain[chain]?.length ?? 0;
  const error = out.errors?.find((e) => e.chain === chain);
  expect(error?.code).not.toBe('schema_mismatch');
  if (count > 0) return;
  if (error && (error.code === 'unavailable' || error.code === 'rate_limited')) {
    ctx.skip(`${chain} upstream outage (${error.code}): ${error.reason ?? ''}`);
    return;
  }
  expect.fail(`${chain} returned 0 products with no upstream error: ${JSON.stringify(error)}`);
}

describe('live smoke (RUN_LIVE=1)', () => {
  itLive('Migros search returns products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['migros'], limit: 5 });
    expectChainProducts(out, 'migros', ctx);
  }, 30000);

  itLive('Coop search returns products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['coop'], limit: 5 });
    expectChainProducts(out, 'coop', ctx);
  }, 30000);

  itLive('Aldi search returns products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['aldi'], limit: 5 });
    expectChainProducts(out, 'aldi', ctx);
  }, 30000);

  itLive('Lidl returns at least products or no error', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['lidl'], limit: 5 });
    // Lidl may return 0 if not in current weekly leaflet. Accept any non-error result.
    expect(out.errors?.find((e) => e.chain === 'lidl')).toBeUndefined();
  }, 30000);

  itLive('Farmy search returns products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['farmy'], limit: 5 });
    expectChainProducts(out, 'farmy', ctx);
  }, 30000);

  itLive('Volgshop search returns products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['volgshop'], limit: 5 });
    expectChainProducts(out, 'volgshop', ctx);
  }, 30000);

  itLive('Ottos search returns grocery-category products', async (ctx) => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'spaghetti', chains: ['ottos'], limit: 5 });
    expectChainProducts(out, 'ottos', ctx);
  }, 30000);

  itLive('Ottos store + per-store stock query works near Wettingen', async (ctx) => {
    const { OttosAdapter } = await import('../../src/adapters/ottos/index.js');
    const adapter = new OttosAdapter();

    // 1) searchStores: assert shape, not specific stores. The "Wettingen
    // exists" check is fair because Otto's has had a permanent store there
    // since long before this project; if that ever stops being true the
    // test failure correctly signals real coverage drift.
    const stores = await adapter.searchStores({ near: { lat: 47.466, lng: 8.319 }, radiusKm: 25 });
    if (!stores.ok) {
      if (stores.error.code === 'unavailable' || stores.error.code === 'rate_limited') {
        ctx.skip(`ottos upstream outage (${stores.error.code})`);
        return;
      }
      expect.fail(`ottos searchStores failed: ${JSON.stringify(stores.error)}`);
    }
    expect(stores.data.length).toBeGreaterThan(0);
    expect(stores.data.some((s) => s.address.zip === '5430')).toBe(true);

    // 2) findStoresWithStock: don't pin to a specific product code or
    // assert quantity > 0. Either of those will start failing the day
    // that exact item is delisted or sold out everywhere — neither
    // signals a real adapter bug. Instead, discover a currently-listed
    // product via search, then assert the stock endpoint responds with
    // a parseable shape and at least one store entry.
    const search = await adapter.searchProducts({ query: 'shampoo', limit: 5 });
    expect(search.ok).toBe(true);
    if (!search.ok || search.data.length === 0) return;
    const id = search.data[0].id;
    const stock = await adapter.findStoresWithStock!(id, { lat: 47.466, lng: 8.319 });
    expect(stock.ok).toBe(true);
    if (!stock.ok) return;
    expect(stock.data.length).toBeGreaterThan(0);
    // Each entry has the canonical store fields and a boolean inStock.
    for (const r of stock.data.slice(0, 3)) {
      expect(r.store.chain).toBe('ottos');
      expect(typeof r.inStock).toBe('boolean');
    }
  }, 30000);

  itLive('find_stores near 8001 returns >=1 store across chains', async () => {
    const r = buildRegistry();
    const out = await findStoresHandler(r, { near: { zip: '8001' }, radiusKm: 5 });
    expect(out.length).toBeGreaterThan(0);
  }, 30000);

  itLive('get_promotions returns promos with non-empty product names from at least one chain', async () => {
    const r = buildRegistry();
    const promos = await getPromotionsHandler(r, {});
    const named = promos.filter((p) => p.productName && p.productName.trim() !== '');
    expect(named.length).toBeGreaterThan(0);
  }, 60000);

  itLive('end-to-end plan_shopping for a 3-item list near 8001 produces a non-empty plan', async () => {
    const r = buildRegistry();
    const out = await planShoppingHandler(r, {
      items: [{ query: 'milch' }, { query: 'brot' }, { query: 'eier' }],
      near: { zip: '8001' },
      strategy: 'split_cart',
    });
    expect(out.primary.totalChf).toBeGreaterThan(0);
    expect(out.primary.stops.length).toBeGreaterThan(0);
  }, 60000);
});
