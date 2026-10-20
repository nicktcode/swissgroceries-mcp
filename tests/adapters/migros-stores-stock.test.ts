import { describe, it, expect, vi } from 'vitest';
import { MigrosAdapter } from '../../src/adapters/migros/index.js';

// Stores around Zürich HB plus one far away (Aarau) that must be radius-filtered.
const STORES: Record<string, any[]> = {
  hb: [
    { storeId: '0150184', storeName: 'Zürich - Hauptbahnhof', location: { address: 'Bahnhofplatz', zip: '8001', city: 'Zürich', latitude: 47.3779, longitude: 8.5403 } },
    { storeId: '0150140', storeName: 'Zürich - ShopVilleMärt', location: { address: 'ShopVille', zip: '8001', city: 'Zürich', latitude: 47.3776, longitude: 8.5397 } },
  ],
  far: [
    { storeId: '0090320', storeName: 'Aarau', location: { address: 'x', zip: '5000', city: 'Aarau', latitude: 47.392, longitude: 8.044 } },
  ],
};

function makeAdapter() {
  const adapter = new MigrosAdapter();
  const searchStores = vi.fn(async ({ query }: { query: string }) =>
    // Every ZIP query returns the HB stores (duplicates across queries) plus the far store.
    ({ stores: query ? [...STORES.hb, ...STORES.far] : STORES.far }));
  const searchProduct = vi.fn(async ({ query }: { query: string }) =>
    ({ productIds: query === '131110100000' ? [100139240] : [] }));
  const getProductSupply = vi.fn(async () => ({
    availabilities: [{ id: '0150184', stock: 33 }, { id: '0150140', stock: 0 }],
    catalogItemId: 100139240,
  }));
  const getProductDetails = vi.fn(async ({ uids }: { uids: string[] }) =>
    (uids[0] === '100139240' ? { 0: { uid: 100139240, migrosId: '131110100000', name: 'Hummus' } } : []));
  (adapter as any).api = {
    account: { oauth2: { loginGuestToken: async () => ({ token: 't' }) } },
    stores: { searchStores },
    products: {
      productSearch: { searchProduct },
      productDisplay: { getProductDetails },
      productStock: { getProductSupply },
    },
  };
  return { adapter, searchStores, searchProduct, getProductSupply, getProductDetails };
}

const HB = { lat: 47.3779, lng: 8.5403 };

describe('MigrosAdapter.searchStores', () => {
  it('queries by PLZ (not empty/city), dedupes, and radius-filters', async () => {
    const { adapter, searchStores } = makeAdapter();
    const r = await adapter.searchStores({ near: HB, radiusKm: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const call of searchStores.mock.calls) expect(call[0].query).toMatch(/^\d{4}$/);
    expect(r.data.map((s) => s.id).sort()).toEqual(['0150140', '0150184']);
  });
});

describe('MigrosAdapter.findStoresWithStock', () => {
  it('resolves migrosId to uid and makes one batched availability call', async () => {
    const { adapter, getProductSupply } = makeAdapter();
    const r = await adapter.findStoresWithStock('131110100000', HB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getProductSupply).toHaveBeenCalledTimes(1);
    const arg = (getProductSupply.mock.calls[0] as any[])[0];
    expect(arg.pids).toBe('100139240');
    expect(arg.costCenterIds.split(',').sort()).toEqual(['0150140', '0150184']);
    const byId = Object.fromEntries(r.data.map((x) => [x.store.id, x]));
    expect(byId['0150184']).toMatchObject({ inStock: true, quantity: 33 });
    expect(byId['0150140']).toMatchObject({ inStock: false, quantity: 0 });
  });

  it('splits large store lists into chunks of at most 10 costCenterIds', async () => {
    const { adapter, searchStores, getProductSupply } = makeAdapter();
    const many = Array.from({ length: 23 }, (_, i) => ({
      storeId: `0150${String(i).padStart(3, '0')}`, storeName: `S${i}`,
      location: { address: '', zip: '8001', city: 'Zürich', latitude: 47.3779, longitude: 8.5403 },
    }));
    searchStores.mockImplementation(async () => ({ stores: many }));
    const r = await adapter.findStoresWithStock('131110100000', HB);
    expect(r.ok && r.data.length).toBe(23);
    const sizes = getProductSupply.mock.calls.map((c: any[]) => c[0].costCenterIds.split(',').length);
    expect(sizes).toEqual([10, 10, 3]);
  });

  it('surfaces a supply failure as an error instead of reporting every store out of stock', async () => {
    const { adapter, getProductSupply } = makeAdapter();
    getProductSupply.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    const r = await adapter.findStoresWithStock('131110100000', HB);
    expect(r.ok).toBe(false);
  });
});

describe('MigrosAdapter.getProduct', () => {
  it('accepts the migrosId that search_products exposes', async () => {
    const { adapter, getProductDetails } = makeAdapter();
    const r = await adapter.getProduct('131110100000');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.name).toBe('Hummus');
    expect((getProductDetails.mock.calls[0] as any[])[0].uids).toEqual(['100139240']);
  });

  it('returns null for an unknown migrosId', async () => {
    const { adapter } = makeAdapter();
    const r = await adapter.getProduct('999999999999');
    expect(r).toEqual({ ok: true, data: null });
  });
});
