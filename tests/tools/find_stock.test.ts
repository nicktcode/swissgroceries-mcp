import { describe, it, expect } from 'vitest';
import { findStockHandler, findStockSchema } from '../../src/tools/find_stock.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { ToolError } from '../../src/tools/errors.js';
import type { StoreAdapter, GeoPoint, StockResult } from '../../src/adapters/types.js';

let lastNearReceived: GeoPoint | undefined;

const stockingAdapter: StoreAdapter = {
  chain: 'ottos',
  capabilities: {
    productSearch: false, productDetail: false, storeSearch: true,
    promotions: false, perStoreStock: true, perStorePricing: false,
  },
  async searchProducts() { return { ok: true, data: [] }; },
  async getProduct() { return { ok: true, data: null }; },
  async searchStores() { return { ok: true, data: [] }; },
  async getPromotions() { return { ok: true, data: [] }; },
  async findStoresWithStock(_id, near): Promise<{ ok: true; data: StockResult[] }> {
    lastNearReceived = near;
    return {
      ok: true,
      data: [{
        store: {
          chain: 'ottos', id: '0074', name: "OTTO'S Wettingen",
          address: { street: 'Landstrasse 99', zip: '5430', city: 'Wettingen' },
          location: { lat: 47.466, lng: 8.327 },
        },
        inStock: true,
        quantity: 12,
      }],
    };
  },
};

const noStockAdapter: StoreAdapter = {
  ...stockingAdapter,
  chain: 'aldi',
  capabilities: { ...stockingAdapter.capabilities, perStoreStock: false },
  findStoresWithStock: undefined,
};

describe('find_stock schema', () => {
  it('accepts {lat,lng}', () => {
    expect(() => findStockSchema.parse({
      chain: 'ottos', productId: 'X', near: { lat: 47.4, lng: 8.5 },
    })).not.toThrow();
  });

  it('accepts {zip}', () => {
    expect(() => findStockSchema.parse({
      chain: 'ottos', productId: 'X', near: { zip: '5430' },
    })).not.toThrow();
  });

  it('accepts {address}', () => {
    expect(() => findStockSchema.parse({
      chain: 'ottos', productId: 'X', near: { address: 'Landstrasse 99, Wettingen' },
    })).not.toThrow();
  });

  it('accepts omitted near', () => {
    expect(() => findStockSchema.parse({ chain: 'ottos', productId: 'X' })).not.toThrow();
  });

  it('rejects unknown chain', () => {
    expect(() => findStockSchema.parse({ chain: 'spar', productId: 'X' })).toThrow();
  });

  it('rejects empty productId', () => {
    expect(() => findStockSchema.parse({ chain: 'ottos', productId: '' })).toThrow();
  });
});

describe('find_stock handler', () => {
  it('resolves zip to lat/lng before calling adapter', async () => {
    lastNearReceived = undefined;
    const r = new AdapterRegistry();
    r.register(stockingAdapter);
    const out = await findStockHandler(r, {
      chain: 'ottos', productId: '350117', near: { zip: '5430' },
    });
    expect(out).toHaveLength(1);
    expect(lastNearReceived).toBeDefined();
    expect(lastNearReceived!.lat).toBeGreaterThan(47);
    expect(lastNearReceived!.lat).toBeLessThan(48);
    expect(lastNearReceived!.lng).toBeGreaterThan(8);
    expect(lastNearReceived!.lng).toBeLessThan(9);
  });

  it('passes lat/lng straight through unchanged', async () => {
    lastNearReceived = undefined;
    const r = new AdapterRegistry();
    r.register(stockingAdapter);
    await findStockHandler(r, {
      chain: 'ottos', productId: 'X', near: { lat: 47.5, lng: 8.5 },
    });
    expect(lastNearReceived).toEqual({ lat: 47.5, lng: 8.5 });
  });

  it('skips geocoding when near is omitted (passes undefined to adapter)', async () => {
    lastNearReceived = { lat: 999, lng: 999 }; // sentinel
    const r = new AdapterRegistry();
    r.register(stockingAdapter);
    await findStockHandler(r, { chain: 'ottos', productId: 'X' });
    expect(lastNearReceived).toBeUndefined();
  });

  it('throws unknown_zip ToolError on bad ZIP', async () => {
    const r = new AdapterRegistry();
    r.register(stockingAdapter);
    let caught: unknown;
    try {
      await findStockHandler(r, {
        chain: 'ottos', productId: 'X', near: { zip: '99999' },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('unknown_zip');
  });

  it('throws capability_unsupported when adapter lacks findStoresWithStock', async () => {
    const r = new AdapterRegistry();
    r.register(noStockAdapter);
    let caught: unknown;
    try {
      await findStockHandler(r, { chain: 'aldi', productId: 'X' });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('capability_unsupported');
  });

  it('throws adapter_not_registered for unknown chain registration', async () => {
    const r = new AdapterRegistry();
    let caught: unknown;
    try {
      await findStockHandler(r, { chain: 'ottos', productId: 'X' });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('adapter_not_registered');
  });
});
