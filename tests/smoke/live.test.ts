import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../../src/index.js';
import { searchProductsHandler } from '../../src/tools/search_products.js';
import { findStoresHandler } from '../../src/tools/find_stores.js';
import { planShoppingHandler } from '../../src/tools/plan_shopping.js';
import { getPromotionsHandler } from '../../src/tools/get_promotions.js';

const RUN = process.env.RUN_LIVE === '1';
const itLive = RUN ? it : it.skip;

describe('live smoke (RUN_LIVE=1)', () => {
  itLive('Migros search returns products', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['migros'], limit: 5 });
    expect(out.byChain.migros?.length ?? 0).toBeGreaterThan(0);
  }, 30000);

  itLive('Coop search returns products', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['coop'], limit: 5 });
    expect(out.byChain.coop?.length ?? 0).toBeGreaterThan(0);
  }, 30000);

  itLive('Aldi search returns products', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['aldi'], limit: 5 });
    expect(out.byChain.aldi?.length ?? 0).toBeGreaterThan(0);
  }, 30000);

  itLive('Lidl returns at least products or no error', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['lidl'], limit: 5 });
    // Lidl may return 0 if not in current weekly leaflet. Accept any non-error result.
    expect(out.errors?.find((e) => e.chain === 'lidl')).toBeUndefined();
  }, 30000);

  itLive('Farmy search returns products', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['farmy'], limit: 5 });
    expect(out.byChain.farmy?.length ?? 0).toBeGreaterThan(0);
    // Schema-mismatch surfacing: the chain must not have errored on the response shape.
    expect(out.errors?.find((e) => e.chain === 'farmy' && e.code === 'schema_mismatch')).toBeUndefined();
  }, 30000);

  itLive('Volgshop search returns products', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['volgshop'], limit: 5 });
    expect(out.byChain.volgshop?.length ?? 0).toBeGreaterThan(0);
    expect(out.errors?.find((e) => e.chain === 'volgshop' && e.code === 'schema_mismatch')).toBeUndefined();
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
