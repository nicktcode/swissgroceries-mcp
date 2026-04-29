import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { healthCheckHandler, healthCheckSchema } from '../../src/tools/health_check.js';
import type { StoreAdapter } from '../../src/adapters/types.js';

function fakeAdapter(chain: any, ok: boolean): StoreAdapter {
  return {
    chain,
    capabilities: { productSearch: true, productDetail: true, storeSearch: true, promotions: false, perStoreStock: false, perStorePricing: false },
    async searchProducts() {
      if (!ok) return { ok: false, error: { code: 'unavailable', reason: 'simulated' } };
      return { ok: true, data: [] };
    },
    async getProduct() { return { ok: true, data: null }; },
    async searchStores() { return { ok: true, data: [] }; },
    async getPromotions() { return { ok: true, data: [] }; },
  };
}

describe('health_check tool', () => {
  it('returns ok for a healthy adapter', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros', true));
    const out = await healthCheckHandler(r, {});
    expect(out.chains.find((c) => c.chain === 'migros')?.ok).toBe(true);
    expect(out.summary.healthy).toBe(1);
  });

  it('returns unhealthy with error code when adapter fails', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('coop', false));
    const out = await healthCheckHandler(r, {});
    const coop = out.chains.find((c) => c.chain === 'coop');
    expect(coop?.ok).toBe(false);
    expect(coop?.error?.code).toBe('unavailable');
  });

  it('reports unregistered for chains not in registry', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros', true));
    const out = await healthCheckHandler(r, {});
    const lidl = out.chains.find((c) => c.chain === 'lidl');
    expect(lidl?.registered).toBe(false);
  });

  it('respects chains filter', async () => {
    const r = new AdapterRegistry();
    r.register(fakeAdapter('migros', true));
    r.register(fakeAdapter('coop', true));
    const out = await healthCheckHandler(r, { chains: ['coop'] });
    expect(out.chains.length).toBe(1);
    expect(out.chains[0].chain).toBe('coop');
  });
});
