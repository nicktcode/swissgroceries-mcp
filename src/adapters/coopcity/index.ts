// CoopCityAdapter: Coop City department stores (coop-city.ch). Separate
// catalogue from coop.ch (cosmetics, fashion, household, electronics), so it
// is its own chain rather than part of `coop`.
import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  StockResult, GeoPoint,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { coopCityFetch } from './client.js';
import {
  normalizeProduct, normalizePromotion, normalizeStore, normalizeStockResult, isCoopCityStore,
} from './normalize.js';
import { CoopCitySearchResponseSchema, CoopCityStoreListResponseSchema } from './schemas.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  if (/403|DataDome|captcha/i.test(msg)) return { code: 'unavailable', reason: `blocked by bot protection: ${msg}` };
  return { code: 'unavailable', reason: msg };
}

function lang(l: string | undefined): string {
  return l === 'fr' ? 'fr' : l === 'it' ? 'it' : 'de';
}

export class CoopCityAdapter implements StoreAdapter {
  readonly chain = 'coopcity' as const;
  // Non-food catalogue: only queried when a caller names `coopcity` in chains.
  readonly optIn = true;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: true,
    promotions: true,
    perStoreStock: true,
    perStorePricing: false,
  };

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const limit = q.limit ?? 20;
      const offset = q.offset ?? 0;
      // Default sort on this base site is "cheapest"; ask for relevance.
      const r = await coopCityFetch('/products/search', {
        query: `${q.query}:relevance`,
        pageSize: Math.min(limit, 100),
        currentPage: Math.floor(offset / limit),
        lang: lang(q.language),
        curr: 'CHF',
        fields: 'FULL',
      });
      const parsed = CoopCitySearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      return ok((parsed.data.products ?? []).map((p) => normalizeProduct(p as any)));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const r = await coopCityFetch(`/products/${encodeURIComponent(id)}`, {
        fields: 'FULL',
        lang: 'de',
        curr: 'CHF',
      });
      return ok(r ? normalizeProduct(r) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404|400/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      const radius = q.radiusKm ?? 10;
      // `radius` is in metres. The store locator also returns Coop
      // supermarkets, so keep only Coop City branches.
      const r = await coopCityFetch('/stores', {
        latitude: q.near.lat,
        longitude: q.near.lng,
        radius: Math.round(radius * 1000),
        pageSize: 100,
        fields: 'FULL',
      });
      const parsed = CoopCityStoreListResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const stores = (parsed.data.stores ?? [])
        .filter((s) => isCoopCityStore(s as any))
        .map((s) => normalizeStore(s as any))
        .filter((s) => haversineKm(q.near, s.location) <= radius);
      return ok(q.limit ? stores.slice(0, q.limit) : stores);
    } catch (e) {
      return err(classify(e));
    }
  }

  async findStoresWithStock(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>> {
    try {
      // Returns every Coop City branch, nearest first, with stockInfo.
      const r = await coopCityFetch(`/products/${encodeURIComponent(productId)}/stock`, {
        latitude: near?.lat ?? 47.3769,
        longitude: near?.lng ?? 8.5417,
        pageSize: 100,
        fields: 'FULL',
      }, true);
      const parsed = CoopCityStoreListResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      return ok((parsed.data.stores ?? [])
        .filter((s) => isCoopCityStore(s as any))
        .map((s) => normalizeStockResult(s as any)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return err({ code: 'not_found' });
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      const r = await coopCityFetch('/products/search', {
        query: `${q.query ?? ''}:relevance:hasDiscount:true`,
        pageSize: 100,
        lang: lang(q.language),
        curr: 'CHF',
        fields: 'FULL',
      });
      const parsed = CoopCitySearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      // No end dates on the API, so endingWithinDays can't be honoured.
      if (q.endingWithinDays !== undefined) return ok([]);
      return ok((parsed.data.products ?? []).map((p) => normalizePromotion(p as any)));
    } catch (e) {
      return err(classify(e));
    }
  }
}
