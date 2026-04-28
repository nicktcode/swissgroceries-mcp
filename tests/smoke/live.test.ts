import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../../src/index.js';
import { searchProductsHandler } from '../../src/tools/search_products.js';

const RUN = process.env.RUN_LIVE === '1';
const itLive = RUN ? it : it.skip;

describe('live smoke (RUN_LIVE=1 only)', () => {
  itLive('search_products("milch") returns at least one Migros product', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['migros'], limit: 5 });
    expect(out.byChain.migros?.length ?? 0).toBeGreaterThan(0);
  }, 30000);

  itLive('search_products("milch") returns at least one Coop product', async () => {
    const r = buildRegistry();
    const out = await searchProductsHandler(r, { query: 'milch', chains: ['coop'], limit: 5 });
    expect(out.byChain.coop?.length ?? 0).toBeGreaterThan(0);
  }, 30000);
});
