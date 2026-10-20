import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { lidlFetch, lidlWebFetch } from './client.js';
import {
  normalizeProduct, normalizeStore, normalizePromotion, normalizeCatalogProduct, isCatalogFood,
} from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';
import {
  LidlCampaignGroupsSchema, LidlCampaignSchema, LidlSearchResponseSchema, LidlGridboxResponseSchema,
} from './schemas.js';

function classify(e: unknown): AdapterError {
  if (e instanceof Error && (e as any).code === 'schema_mismatch') {
    return { code: 'schema_mismatch', sample: (e as any).sample ?? '' };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

function lang(l: string | undefined): 'de' | 'fr' | 'it' {
  return l === 'fr' ? 'fr' : l === 'it' ? 'it' : 'de';
}

// lidl.ch ERP numbers are 8 digits; anything else is a leaflet product id.
const ERP_RX = /^\d{8}$/;

// The storefront caps a page at 60 items.
const MAX_FETCH = 60;

export const DEFAULT_STORE = process.env.LIDL_DEFAULT_STORE ?? 'CH0149';

interface CampaignCache {
  campaigns: any[];
  products: any[];
  expires: number;
}

export class LidlAdapter implements StoreAdapter {
  readonly chain = 'lidl' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: true,
    promotions: true,
    perStoreStock: false,
    perStorePricing: false,
  };

  private cache: Partial<CampaignCache> = {};

  private async loadCampaigns(): Promise<any[]> {
    if (this.cache.campaigns && this.cache.expires && Date.now() < this.cache.expires) {
      return this.cache.campaigns;
    }
    const rawGroups = await lidlFetch('digital-leaflet.lidlplus.com', '/api/v1/CH/campaignGroups');
    const groupsParsed = LidlCampaignGroupsSchema.safeParse(rawGroups);
    if (!groupsParsed.success) {
      throw Object.assign(new Error('schema_mismatch'), {
        code: 'schema_mismatch',
        sample: JSON.stringify(rawGroups).slice(0, 500),
      });
    }
    // Real shape: { groups: [ { title, campaigns: [{id, title, ...}] } ] }
    const campaignRefs: any[] = (groupsParsed.data.groups ?? []).flatMap((g: any) => g.campaigns ?? []);
    const ids: string[] = campaignRefs.map((c: any) => c.id ?? c.campaignId).filter(Boolean);
    const rawCampaigns = await Promise.all(
      ids.slice(0, 5).map((id) =>
        lidlFetch('digital-leaflet.lidlplus.com', `/api/v1/CH/campaigns/${id}`).catch(() => null),
      ),
    );
    const validCampaigns = rawCampaigns.filter(Boolean).filter((raw) => {
      const cp = LidlCampaignSchema.safeParse(raw);
      return cp.success;
    });
    this.cache = {
      campaigns: validCampaigns,
      // Real campaign shape: campaign.products (array of product objects)
      products: validCampaigns.flatMap((c: any) => c.products ?? c.items ?? []),
      expires: Date.now() + 30 * 60 * 1000,
    };
    return this.cache.campaigns!;
  }

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      // Storefront search over the whole online assortment. Non-food hits
      // (furniture, clothing) are dropped, so over-fetch a little; `offset`
      // is applied to the raw hit list.
      const limit = q.limit ?? 20;
      const r = await lidlWebFetch('/q/api/search', {
        q: q.query,
        locale: `${lang(q.language)}_CH`,
        assortment: 'CH',
        version: 'v2.0.0',
        offset: String(q.offset ?? 0),
        fetchsize: String(Math.min(limit * 2, MAX_FETCH)),
      });
      const parsed = LidlSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const products = (parsed.data.items ?? [])
        .filter((i) => i.type === 'product' && i.gridbox?.data)
        .map((i) => i.gridbox!.data as any)
        .filter(isCatalogFood)
        .map(normalizeCatalogProduct)
        .filter((p): p is NormalizedProduct => p !== null);
      return ok(products.slice(0, limit));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      if (ERP_RX.test(id)) {
        const r = await lidlWebFetch('/p/api/gridboxes/CH/de', { erpNumbers: id });
        const parsed = LidlGridboxResponseSchema.safeParse(r);
        if (!parsed.success) {
          return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
        }
        const first = parsed.data[0];
        return ok(first ? normalizeCatalogProduct(first as any) : null);
      }
      const r = await lidlFetch('digital-leaflet.lidlplus.com', `/api/v1/CH/products/${encodeURIComponent(id)}`);
      return ok(r ? normalizeProduct(r) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      // Real stores API: v2/CH returns an array with storeKey, name, address, postalCode, locality, location
      const stores = await lidlFetch('stores.lidlplus.com', '/api/v2/CH', {
        countryCode: 'CH',
        latitude: String(q.near.lat),
        longitude: String(q.near.lng),
        radius: String((q.radiusKm ?? 5) * 1000),
      });
      const list: any[] = Array.isArray(stores) ? stores : [];
      const radius = q.radiusKm ?? 5;
      return ok(
        list
          .map(normalizeStore)
          .filter((s) => haversineKm(q.near, s.location) <= radius)
          .slice(0, q.limit ?? 20),
      );
    } catch (e) {
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      await this.loadCampaigns();
      let promos = (this.cache.products ?? []).map(normalizePromotion);
      if (q.query) {
        const needle = q.query.toLowerCase();
        promos = promos.filter((p) => p.productName.toLowerCase().includes(needle));
      }
      if (q.endingWithinDays !== undefined) {
        // Lidl campaign-list products don't carry validUntil dates; skip the filter
        // when no item has it, otherwise we'd silently return [].
        const hasAnyValidUntil = promos.some((p) => p.validUntil);
        if (hasAnyValidUntil) {
          const cutoff = Date.now() + q.endingWithinDays * 24 * 3600 * 1000;
          promos = promos.filter((p) => p.validUntil && Date.parse(p.validUntil) <= cutoff);
        }
      }
      return ok(promos);
    } catch (e) {
      return err(classify(e));
    }
  }
}
