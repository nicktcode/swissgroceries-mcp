import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { aldiFetch, ALDI_DEFAULT_SERVICE_POINT } from './client.js';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';
import { AldiSearchResponseSchema } from './schemas.js';

const ALDI_VALID_LIMITS = [12, 16, 24, 30, 32, 48, 60] as const;

// /v2/service-points accepts limit=100; the cap guards against a runaway loop
// if totalCount ever goes missing.
const STORE_PAGE_SIZE = 100;
const STORE_PAGE_CAP = 1000;

function snapAldiLimit(limit?: number): number {
  const target = limit ?? 16;
  for (const v of ALDI_VALID_LIMITS) {
    if (v >= target) return v;
  }
  return 60;
}

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class AldiAdapter implements StoreAdapter {
  readonly chain = 'aldi' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: true,
    promotions: true,
    perStoreStock: false,
    perStorePricing: false,
  };

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const servicePoint = q.storeIds?.[0] ?? ALDI_DEFAULT_SERVICE_POINT;
      const requested = q.limit ?? 16;
      const offset = q.offset ?? 0;
      const r = await aldiFetch('/v3/product-search', {
        q: q.query,
        servicePoint,
        serviceType: 'walk-in',
        offset,
        limit: snapAldiLimit(requested),
      });
      const parsed = AldiSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) } as AdapterError);
      }
      // Real API wraps results in `data`, not `products`/`results`
      const list = ((parsed.data.data ?? parsed.data.products ?? parsed.data.results ?? []) as any[]).slice(0, requested);
      return ok(list.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const r = await aldiFetch(`/v2/products/${encodeURIComponent(id)}`);
      // Product detail wraps in `data`
      const raw = r.data ?? r;
      return ok(raw ? normalizeProduct(raw) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      // Real endpoint: /v2/service-points. It ignores lat/lng/radius and returns
      // the full Swiss list (~240) in a fixed order, 10 per page by default, so
      // the first page only ever held eastern-Swiss stores and every query
      // elsewhere (e.g. Lausanne) came back empty. Page through the whole list
      // and filter by distance here. Verified live 2026-11-09.
      const list: any[] = [];
      for (let offset = 0; offset < STORE_PAGE_CAP; offset += STORE_PAGE_SIZE) {
        const r = await aldiFetch('/v2/service-points', {
          lat: q.near.lat,
          lng: q.near.lng,
          limit: STORE_PAGE_SIZE,
          offset,
        });
        const page = (r.data ?? r.stores ?? r.results ?? []) as any[];
        list.push(...page);
        const total = r.meta?.pagination?.totalCount;
        if (page.length < STORE_PAGE_SIZE || (typeof total === 'number' && list.length >= total)) break;
      }
      const radius = q.radiusKm ?? 5;
      return ok(list.map(normalizeStore).filter((s) => haversineKm(q.near, s.location) <= radius));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      const r = await aldiFetch('/v3/product-search', {
        q: q.query ?? '',
        servicePoint: ALDI_DEFAULT_SERVICE_POINT,
        serviceType: 'walk-in',
        onlyPromotion: 'true',
        offset: 0,
        limit: snapAldiLimit(50),
      });
      const list = (r.data ?? r.products ?? []) as any[];
      let promos = list.map(normalizePromotion);
      if (q.endingWithinDays !== undefined) {
        const cutoff = Date.now() + q.endingWithinDays * 24 * 3600 * 1000;
        promos = promos.filter((p) => p.validUntil && Date.parse(p.validUntil) <= cutoff);
      }
      return ok(promos);
    } catch (e) {
      return err(classify(e));
    }
  }
}
