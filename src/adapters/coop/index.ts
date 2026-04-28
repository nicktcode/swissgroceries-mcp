import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion, StockResult,
  SearchQuery, StoreQuery, PromotionQuery, GeoPoint,
} from '../types.js';
import { coopFetch } from './client.js';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/DataDome|challenge/i.test(msg)) return { code: 'unavailable', reason: msg };
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class CoopAdapter implements StoreAdapter {
  readonly chain = 'coop' as const;
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
      const r: any = await coopFetch(`/products/search/${encodeURIComponent(q.query)}`, {
        query: { currentPage: 0, pageSize: q.limit ?? 20, query: 'availableOnline:false' },
        language: q.language ?? 'de',
      });
      const list = r.products ?? [];
      return ok(list.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const r: any = await coopFetch(`/products/${encodeURIComponent(id)}`, { language: 'de' });
      return ok(r ? normalizeProduct(r) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      const r: any = await coopFetch('/locations/searchAroundCoordinates', {
        query: { latitude: q.near.lat, longitude: q.near.lng, currentPage: 0 },
        language: 'de',
      });
      // Coop returns `locations` array (not `stores`)
      const list = (r.locations ?? r.stores ?? []) as any[];
      const radius = q.radiusKm ?? 5;
      return ok(list.map(normalizeStore).filter((s) => haversineKm(q.near, s.location) <= radius));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      const r: any = await coopFetch('/cms/content-teasers-aktionen', { language: q.language ?? 'de' });
      // The endpoint returns near-empty response in practice; items may live in various keys
      const list = (r.products ?? r.teasers ?? r.items ?? r.entries ?? []) as any[];
      let promos = list.map(normalizePromotion);
      if (q.query) {
        const needle = q.query.toLowerCase();
        promos = promos.filter((p) => p.productName.toLowerCase().includes(needle));
      }
      if (q.endingWithinDays !== undefined) {
        const cutoff = Date.now() + q.endingWithinDays * 24 * 3600 * 1000;
        promos = promos.filter((p) => p.validUntil && Date.parse(p.validUntil) <= cutoff);
      }
      return ok(promos);
    } catch (e) {
      return err(classify(e));
    }
  }

  async findStoresWithStock(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>> {
    try {
      const point = near ?? { lat: 47.376, lng: 8.541 };
      const r: any = await coopFetch('/locations/searchAroundCoordinates', {
        query: {
          latitude: point.lat, longitude: point.lng,
          availabilityProductId: productId,
          onlyWithAvailableProductId: 'true',
          currentPage: 0,
        },
        language: 'de',
      });
      const list = (r.locations ?? r.stores ?? []) as any[];
      return ok(list.map((raw) => ({ store: normalizeStore(raw), inStock: true })));
    } catch (e) {
      return err(classify(e));
    }
  }
}
