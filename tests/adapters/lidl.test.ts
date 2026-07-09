import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseSize, normalizeProduct, normalizeStore, normalizePromotion,
  parseKeyfacts, normalizeSearchProduct,
} from '../../src/adapters/lidl/normalize.js';
import { localeForLanguage } from '../../src/adapters/lidl/client.js';
import {
  LidlProductSchema, LidlCampaignSchema, LidlCampaignGroupsSchema, LidlSearchResponseSchema,
} from '../../src/adapters/lidl/schemas.js';

describe('lidl parseSize', () => {
  it('handles 1L', () => expect(parseSize('1L')).toEqual({ value: 1, unit: 'l' }));
  it('handles 500g', () => expect(parseSize('500g')).toEqual({ value: 500, unit: 'g' }));
  it('handles 1.5kg', () => expect(parseSize('1.5kg')).toEqual({ value: 1.5, unit: 'kg' }));
  it('handles 25cl', () => expect(parseSize('25cl')).toEqual({ value: 250, unit: 'ml' }));
  it('handles 6er', () => expect(parseSize('6er')).toEqual({ value: 6, unit: 'piece' }));
  it('returns undefined for no match', () => expect(parseSize('keine Angabe')).toBeUndefined());
  it('returns undefined for undefined input', () => expect(parseSize(undefined)).toBeUndefined());
});

describe('lidl normalizeProduct', () => {
  it('produces chain=lidl with unitPrice (mainPrice format)', () => {
    const p = normalizeProduct({
      id: '10091030_10050172',
      title: 'Milch',
      mainPrice: { price: 1.5, oldPrice: 1.8 },
      subtitle: '1L',
    } as any);
    expect(p.chain).toBe('lidl');
    expect(p.id).toBe('10091030_10050172');
    expect(p.price.current).toBeCloseTo(1.5);
    expect(p.price.regular).toBeCloseTo(1.8);
    expect(p.price.currency).toBe('CHF');
    expect(p.unitPrice?.value).toBeCloseTo(1.5);
    expect(p.unitPrice?.per).toBe('l');
  });

  it('derives swiss-made tag from name', () => {
    const p = normalizeProduct({ id: '1', title: 'Schweizer Käse', mainPrice: { price: 3 } } as any);
    expect(p.tags).toContain('swiss-made');
  });

  it('falls back to imageUrls array (product detail format)', () => {
    const url = 'https://example.com/img.jpg';
    const p = normalizeProduct({ id: '1', title: 'Test', imageUrls: [url], mainPrice: { price: 1 } } as any);
    expect(p.imageUrl).toBe(url);
  });

  it('uses imageUrl when present (campaign list format)', () => {
    const url = 'https://example.com/img.jpg';
    const p = normalizeProduct({ id: '1', title: 'Test', imageUrl: url, mainPrice: { price: 1 } } as any);
    expect(p.imageUrl).toBe(url);
  });

  it('omits empty brand string', () => {
    const p = normalizeProduct({ id: '1', title: 'Test', brand: '', mainPrice: { price: 1 } } as any);
    expect(p.brand).toBeUndefined();
  });
});

describe('lidl normalizeStore', () => {
  it('maps v2/CH store fields correctly', () => {
    const raw = {
      storeKey: 'CH0149',
      name: 'Wettingen (Fil.Nr. 0149)',
      address: 'Schwimmbadstrasse 29',
      postalCode: '5430',
      locality: 'Wettingen',
      location: { latitude: 47.46167, longitude: 8.31073 },
    };
    const s = normalizeStore(raw);
    expect(s.chain).toBe('lidl');
    expect(s.id).toBe('CH0149');
    expect(s.name).toBe('Wettingen (Fil.Nr. 0149)');
    expect(s.address.street).toBe('Schwimmbadstrasse 29');
    expect(s.address.zip).toBe('5430');
    expect(s.address.city).toBe('Wettingen');
    expect(s.location.lat).toBeCloseTo(47.46167);
    expect(s.location.lng).toBeCloseTo(8.31073);
  });
});

describe('lidl normalizePromotion', () => {
  it('maps mainPrice to promotion price', () => {
    const raw = {
      id: 'p1',
      title: 'Rotwein',
      mainPrice: { price: 4.99, oldPrice: 6.5 },
    };
    const promo = normalizePromotion(raw);
    expect(promo.chain).toBe('lidl');
    expect(promo.productId).toBe('p1');
    expect(promo.productName).toBe('Rotwein');
    expect(promo.price?.current).toBeCloseTo(4.99);
    expect(promo.price?.regular).toBeCloseTo(6.5);
    expect(promo.price?.currency).toBe('CHF');
  });

  it('populates productName for typical promo input', () => {
    const raw = {
      id: '10091030_10050172',
      title: 'Schweizer Rohschinken',
      subtitle: '150g',
      mainPrice: { price: 3.49, oldPrice: 4.99 },
    };
    const promo = normalizePromotion(raw as any);
    expect(promo.productName).toBe('Schweizer Rohschinken');
    expect(promo.productName.trim()).not.toBe('');
    expect(promo.price?.current).toBeCloseTo(3.49);
    expect(promo.price?.regular).toBeCloseTo(4.99);
  });

  it('falls back through name fields when title absent', () => {
    const raw = { id: 'x', mainPrice: { price: 1.0 } };
    const promo = normalizePromotion(raw as any);
    expect(promo.productName).toBe('');
    expect(promo.chain).toBe('lidl');
  });
});

describe('lidl schemas (zod validation)', () => {
  it('LidlProductSchema accepts a minimal valid product', () => {
    const result = LidlProductSchema.safeParse({ id: '1', title: 'Milch', mainPrice: { price: 1.5 } });
    expect(result.success).toBe(true);
  });

  it('LidlProductSchema passes through unknown fields', () => {
    const result = LidlProductSchema.safeParse({ id: '1', unknownField: 'extra' });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as any).unknownField).toBe('extra');
  });

  it('LidlCampaignSchema accepts a campaign with products', () => {
    const result = LidlCampaignSchema.safeParse({
      id: '10091030',
      title: 'Dauerhaft günstiger',
      products: [{ id: 'p1', title: 'Milch', mainPrice: { price: 1.5 } }],
    });
    expect(result.success).toBe(true);
  });

  it('LidlCampaignGroupsSchema validates the campaignGroups fixture', () => {
    let raw: any;
    try { raw = JSON.parse(readFileSync('tests/fixtures/lidl/campaignGroups.json', 'utf8')); }
    catch { return; }
    if (!raw) return;
    const result = LidlCampaignGroupsSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.groups)).toBe(true);
    }
  });
});

describe('lidl localeForLanguage', () => {
  it('maps fr -> fr_CH', () => expect(localeForLanguage('fr')).toBe('fr_CH'));
  it('maps it -> it_CH', () => expect(localeForLanguage('it')).toBe('it_CH'));
  it('maps de -> de_CH', () => expect(localeForLanguage('de')).toBe('de_CH'));
  it('falls back en -> de_CH (no Swiss English locale)', () => expect(localeForLanguage('en')).toBe('de_CH'));
  it('falls back undefined -> de_CH', () => expect(localeForLanguage(undefined)).toBe('de_CH'));
});

describe('lidl parseKeyfacts', () => {
  it('fixed multipack + explicit base price -> pack total size and base unitPrice', () => {
    const html = '<ul> <li>Origine: Suisse</li> <li>2 x 400 g</li> <li>100 g = 1.87</li> </ul>';
    const r = parseKeyfacts(html, 14.99);
    expect(r.size).toEqual({ value: 800, unit: 'g' });
    expect(r.unitPrice).toEqual({ value: 18.7, per: 'kg' });
  });

  it('another fixed multipack (3 x 150 g, base 2.22)', () => {
    const html = '<ul> <li>Assaisonn&eacute;s</li> <li>Origine: Suisse</li> <li>3 x 150 g</li> <li>100 g = 2.22</li> </ul>';
    const r = parseKeyfacts(html, 9.99);
    expect(r.size).toEqual({ value: 450, unit: 'g' });
    expect(r.unitPrice).toEqual({ value: 22.2, per: 'kg' });
  });

  it('variable-weight item -> per-100 g unitPrice from current price, no misleading size', () => {
    const html = '<ul> <li>À la pièce</li> <li>Origine: Uruguay</li> <li>100 g</li> <li>Env. 800-1200 g</li> </ul>';
    const r = parseKeyfacts(html, 2.95);
    expect(r.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(r.size).toBeUndefined();
  });

  it('decodes HTML entities so the fr variable-weight marker survives without "env."', () => {
    // Regression guard: "&Agrave; la pi&egrave;ce" must decode to "À la pièce"
    // and still be detected as variable-weight even when no "env." line is present.
    const html = '<ul> <li>&Agrave; la pi&egrave;ce</li> <li>100 g</li> </ul>';
    const r = parseKeyfacts(html, 2.95);
    expect(r.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(r.size).toBeUndefined();
  });

  it('accepts a comma decimal in the base price (de/it formatting)', () => {
    const r = parseKeyfacts('<ul> <li>500 g</li> <li>100 g = 1,87</li> </ul>', 9.35);
    expect(r.unitPrice).toEqual({ value: 18.7, per: 'kg' });
    expect(r.size).toEqual({ value: 500, unit: 'g' });
  });

  it('single fixed pack, no base price -> size only (unitPrice derived later)', () => {
    const r = parseKeyfacts('<ul> <li>500 g</li> </ul>', 3.5);
    expect(r.size).toEqual({ value: 500, unit: 'g' });
    expect(r.unitPrice).toBeUndefined();
  });

  it('de variable-weight marker "ca." -> per-100 g price, no size', () => {
    const r = parseKeyfacts('<ul> <li>St&uuml;ck</li> <li>ca. 800-1200 g</li> <li>100 g</li> </ul>', 2.95);
    expect(r.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(r.size).toBeUndefined();
  });

  it('it variable-weight marker "al pezzo" -> per-100 g price, no size', () => {
    const r = parseKeyfacts('<ul> <li>al pezzo</li> <li>100 g</li> <li>800-1200 g</li> </ul>', 2.95);
    expect(r.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(r.size).toBeUndefined();
  });

  it('bare weight range with NO marker word still reads "100 g" as a basis, not a size', () => {
    // Regression guard for the F3 case: a variable-weight listing whose localized
    // marker is missing must not surface the 100 g pricing basis as the pack size.
    const r = parseKeyfacts('<ul> <li>800-1200 g</li> <li>100 g</li> </ul>', 2.95);
    expect(r.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(r.size).toBeUndefined();
  });

  it('returns empty object for missing/empty description', () => {
    expect(parseKeyfacts(undefined, 5)).toEqual({});
    expect(parseKeyfacts('', 5)).toEqual({});
  });
});

describe('lidl normalizeSearchProduct (promotion path)', () => {
  it('surfaces a real markdown: regular price, discount text and ISO end date', () => {
    // The fixture never exercises this branch (every item has oldPrice 0), so the
    // markdown path — regular price + unix->ISO validUntil + discountText — is
    // covered here on synthetic data.
    const validUntil = 1750000000; // fixed epoch seconds -> deterministic ISO
    const p = normalizeSearchProduct({
      itemId: 999,
      fullTitle: 'TEST Promo Item',
      brand: { name: 'TEST' },
      price: { price: 3.49, oldPrice: 4.99, discount: { discountText: '-30%' } },
      keyfacts: { description: '<ul> <li>500 g</li> <li>100 g = 0.70</li> </ul>' },
      canonicalPath: '/p/de-CH/test/p999',
      online: false,
      store: true,
      stockAvailability: { badgeInfoV2: [{ validUntil }] },
    });
    expect(p.price.regular).toBeCloseTo(4.99);
    expect(p.promotion).toBeDefined();
    expect(p.promotion?.description).toBe('-30%');
    expect(p.promotion?.endsAt).toBe(new Date(validUntil * 1000).toISOString());
    expect(p.size).toEqual({ value: 500, unit: 'g' });
    expect(p.unitPrice).toEqual({ value: 7, per: 'kg' });
  });
});

describe('lidl normalizeSearchProduct (real fixture)', () => {
  const raw = JSON.parse(readFileSync('tests/fixtures/lidl/search-boeuf.json', 'utf8'));
  const parsed = LidlSearchResponseSchema.safeParse(raw);
  const products = (parsed.success ? parsed.data.items ?? [] : [])
    .filter((it: any) => it.type === 'product' && it.gridbox?.data)
    .map((it: any) => normalizeSearchProduct(it.gridbox.data));
  const byId = (id: string) => products.find((p) => p.id === id)!;

  it('the fixture parses against LidlSearchResponseSchema', () => {
    expect(parsed.success).toBe(true);
  });

  it('normalizes every product hit (5 in the fixture)', () => {
    expect(products.length).toBe(5);
    for (const p of products) {
      expect(p.chain).toBe('lidl');
      expect(p.price.currency).toBe('CHF');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('maps a fixed multipack (viande hachée 2 x 400 g)', () => {
    const p = byId('10055483');
    expect(p.name).toContain('Viande hachée');
    expect(p.brand).toBe('QUALITÉ SUISSE');
    expect(p.price.current).toBeCloseTo(14.99);
    expect(p.size).toEqual({ value: 800, unit: 'g' });
    expect(p.unitPrice).toEqual({ value: 18.7, per: 'kg' });
    expect(p.availability).toBe('store-only');
    expect(p.productUrl).toBe('https://www.lidl.ch/p/fr-CH/qualite-suisse-viande-hachee-de-boeuf-allegee-pack-de-2-xxl/p10055483');
    expect(p.imageUrl).toBeTruthy();
  });

  it('maps a variable-weight item (entrecôte) to a per-kg price with no size', () => {
    const p = byId('10055456');
    expect(p.unitPrice).toEqual({ value: 29.5, per: 'kg' });
    expect(p.size).toBeUndefined();
  });

  it('does not fabricate a promotion when there is no reference price (oldPrice 0)', () => {
    // Every fixture item is tagged "Action" but has oldPrice 0 — no real markdown.
    for (const p of products) {
      expect(p.price.regular).toBeUndefined();
      expect(p.promotion).toBeUndefined();
    }
  });
});
