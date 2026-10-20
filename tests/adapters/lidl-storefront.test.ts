import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeCatalogProduct, parseKeyfacts, keyfactLines, isCatalogFood,
} from '../../src/adapters/lidl/normalize.js';
import { LidlAdapter } from '../../src/adapters/lidl/index.js';
import * as client from '../../src/adapters/lidl/client.js';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/lidl/${name}`, 'utf8'));
const items = (name: string) => fixture(name).items.map((i: any) => i.gridbox.data);
const byErp = (name: string, erp: string) => items(name).find((d: any) => d.erpNumber === erp);

afterEach(() => vi.restoreAllMocks());

describe('lidl keyfacts parsing', () => {
  const kf = (...lines: string[]) => parseKeyfacts(`<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`);

  it('reads a fixed multipack as the whole pack', () => {
    expect(kf('Pro 6 x 1,5 l', '1 l = 0.36').size).toEqual({ value: 9, unit: 'l' });
  });
  it('reads fr/it bare quantities and named entities', () => {
    expect(kf('250 g', '100 g = 1.40').size).toEqual({ value: 250, unit: 'g' });
    expect(kf('Pro St&uuml;ck').size).toEqual({ value: 1, unit: 'piece' });
    expect(kf('Le kg').size).toEqual({ value: 1, unit: 'kg' });
  });
  it('treats "Ca." / "Env." items as variable weight priced per base quantity', () => {
    const de = kf('Pro 100 g', 'Ca. 400-800 g');
    expect(de.variableWeight).toBe(true);
    expect(de.size).toBeUndefined();
    expect(de.priceBasis).toEqual({ value: 100, unit: 'g' });
    expect(kf('100 g', 'Env. 400-800 g').variableWeight).toBe(true);
  });
  it('gives no size for variant lists and ranges', () => {
    expect(kf('Pro 34 g/ 48 g/ 56 g').size).toBeUndefined();
    expect(kf('Pro 108-152 Stück').size).toBeUndefined();
  });
  it('falls back to the base-price line', () => {
    expect(kf('Diverse Sorten', '100 g = 1.52').baseLineUnitPrice).toEqual({ value: 15.2, per: 'kg' });
  });
});

describe('lidl normalizeCatalogProduct (fixtures)', () => {
  it('maps a discounted multipack with per-litre price and offer window', () => {
    const p = normalizeCatalogProduct(byErp('storefront-search-wasser-de.json', '10060363'))!;
    expect(p.chain).toBe('lidl');
    expect(p.id).toBe('10060363');
    expect(p.name).toBe('VITTEL Mineralwasser still');
    expect(p.brand).toBe('VITTEL');
    expect(p.size).toEqual({ value: 9, unit: 'l' });
    expect(p.unitPrice?.per).toBe('l');
    expect(p.unitPrice!.value).toBeCloseTo(p.price.current / 9, 5);
    expect(p.price.regular).toBeGreaterThan(p.price.current);
    expect(p.multipack?.count).toBe(6);
    expect(p.productUrl).toBe('https://www.lidl.ch/p/de-CH/vittel-mineralwasser-still/p10060363');
    expect(p.imageUrl).toMatch(/^https:\/\//);
    expect(p.promotion?.endsAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('prices variable-weight meat per kg without inventing a pack size', () => {
    const raw = items('storefront-search-fleisch-de.json').find((d: any) =>
      /ca\./i.test(keyfactLines(d.keyfacts?.description).join(' ')) && d.price?.price > 0);
    const p = normalizeCatalogProduct(raw)!;
    expect(p.size).toBeUndefined();
    expect(p.unitPrice?.per).toBe('kg');
    expect(p.unitPrice!.value).toBeCloseTo(p.price.current * 10, 5); // price is per 100 g
  });

  it('parses French keyfacts', () => {
    const priced = items('storefront-search-fromage-fr.json').filter(isCatalogFood)
      .map(normalizeCatalogProduct).filter(Boolean);
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.filter((p: any) => p.unitPrice).length / priced.length).toBeGreaterThan(0.8);
  });

  it('drops unpriced items', () => {
    expect(normalizeCatalogProduct({ erpNumber: '1', fullTitle: 'X', price: { price: null } })).toBeNull();
  });
});

describe('LidlAdapter storefront', () => {
  it('searches the localized storefront and keeps only food', async () => {
    const spy = vi.spyOn(client, 'lidlWebFetch').mockResolvedValue(fixture('storefront-search-fleisch-de.json'));
    const r = await new LidlAdapter().searchProducts({ query: 'fleisch', language: 'fr', limit: 50 });
    expect(spy.mock.calls[0][0]).toBe('/q/api/search');
    expect(spy.mock.calls[0][1]).toMatchObject({ q: 'fleisch', locale: 'fr_CH', assortment: 'CH' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.every((p) => p.price.current > 0)).toBe(true);
  });

  it('looks up ERP numbers via gridboxes', async () => {
    const spy = vi.spyOn(client, 'lidlWebFetch').mockResolvedValue(fixture('storefront-gridbox-10060363.json'));
    const r = await new LidlAdapter().getProduct('10060363');
    expect(spy.mock.calls[0]).toEqual(['/p/api/gridboxes/CH/de', { erpNumbers: '10060363' }]);
    expect(r.ok && r.data?.name).toBe('VITTEL Mineralwasser still');
  });
});
