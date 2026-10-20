import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeProduct, normalizeStore, normalizeStockResult, isCoopCityStore, imageUrl,
} from '../../src/adapters/coopcity/normalize.js';
import { CoopCityAdapter } from '../../src/adapters/coopcity/index.js';
import * as client from '../../src/adapters/coopcity/client.js';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/coopcity/${name}`, 'utf8'));

afterEach(() => vi.restoreAllMocks());

describe('coopcity normalizeProduct (fixture)', () => {
  it('maps code, brand, CHF price, size and URLs', () => {
    const p = normalizeProduct(fixture('search-full.json').products[0]);
    expect(p.chain).toBe('coopcity');
    expect(p.id).toBe('4290522');
    expect(p.brand).toBe('Nivea');
    expect(p.price).toEqual({ current: 1.95, currency: 'CHF' });
    expect(p.size).toEqual({ value: 50, unit: 'ml' });
    expect(p.productUrl).toMatch(/^https:\/\/www\.coop-city\.ch\/de\/.+\/p\/4290522$/);
    expect(p.imageUrl).toMatch(/^https:\/\/www\.coop-city\.ch\/medias\/[^/]+\.jpg/);
  });
});

describe('coopcity imageUrl', () => {
  it('rewrites the backend media path to the public /medias path', () => {
    expect(imageUrl([{ url: '/cooptradingcommercewebservices/v2/medias/123-001.jpg?context=x' }]))
      .toBe('https://www.coop-city.ch/medias/123-001.jpg?context=x');
  });
  it('prefers the larger zoom format', () => {
    expect(imageUrl([
      { url: '/cooptradingcommercewebservices/v2/medias/small.jpg', format: 'basket-XS-MD' },
      { url: '/cooptradingcommercewebservices/v2/medias/big.jpg', format: 'productImage-zoom-SM2x' },
    ])).toBe('https://www.coop-city.ch/medias/big.jpg');
  });
  it('returns undefined without images', () => expect(imageUrl([])).toBeUndefined());
});

describe('coopcity stores (fixture)', () => {
  it('keeps only Coop City branches from the mixed store locator list', () => {
    const stores = fixture('stores-full.json').stores;
    const city = stores.filter(isCoopCityStore);
    expect(city.length).toBeGreaterThan(0);
    expect(city.length).toBeLessThan(stores.length);
    const s = normalizeStore(city[0]);
    expect(s.chain).toBe('coopcity');
    expect(s.name.startsWith('Coop City')).toBe(true);
    expect(s.address.zip).toMatch(/^\d{4}$/);
    expect(s.hours?.mon).toMatch(/^\d\d:\d\d-\d\d:\d\d$/);
  });

  it('maps per-store stock', () => {
    const r = normalizeStockResult(fixture('stock-full.json').stores.find(isCoopCityStore));
    expect(r.inStock).toBe(true);
    expect(typeof r.quantity).toBe('number');
  });

  it('treats a store without stockInfo as out of stock', () => {
    expect(normalizeStockResult({ name: 'x', displayName: 'Coop City X' }).inStock).toBe(false);
  });
});

describe('CoopCityAdapter', () => {
  it('searches by relevance (the base site defaults to cheapest-first)', async () => {
    const spy = vi.spyOn(client, 'coopCityFetch').mockResolvedValue(fixture('search-full.json'));
    const r = await new CoopCityAdapter().searchProducts({ query: 'shampoo', limit: 5 });
    expect(r.ok && r.data.length).toBe(5);
    expect(spy.mock.calls[0][1]?.query).toBe('shampoo:relevance');
  });

  it('passes the store radius in metres and drops supermarkets', async () => {
    const spy = vi.spyOn(client, 'coopCityFetch').mockResolvedValue(fixture('stores-full.json'));
    const r = await new CoopCityAdapter().searchStores({ near: { lat: 47.3779, lng: 8.5403 }, radiusKm: 5 });
    expect(spy.mock.calls[0][1]?.radius).toBe(5000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.every((s) => s.name.startsWith('Coop City'))).toBe(true);
  });

  it('lists discounted products as promotions without inventing a was-price', async () => {
    const spy = vi.spyOn(client, 'coopCityFetch').mockResolvedValue(fixture('promo-search.json'));
    const r = await new CoopCityAdapter().getPromotions({});
    expect(spy.mock.calls[0][1]?.query).toBe(':relevance:hasDiscount:true');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0].price?.regular).toBeUndefined();
  });

  it('reports bot-protection blocks as unavailable with a reason', async () => {
    vi.spyOn(client, 'coopCityFetch').mockRejectedValue(new Error('HTTP 403'));
    const r = await new CoopCityAdapter().searchProducts({ query: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('unavailable');
  });
});
