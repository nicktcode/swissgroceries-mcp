import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion, StockResult,
  SearchQuery, StoreQuery, PromotionQuery, GeoPoint,
} from '../types.js';
import { coopFetch } from './client.js';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';
import { CoopSearchResponseSchema } from './schemas.js';

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
      const pageSize = q.limit ?? 20;
      const offset = q.offset ?? 0;
      const currentPage = Math.floor(offset / pageSize);
      const r: any = await coopFetch(`/products/search/${encodeURIComponent(q.query)}`, {
        query: { currentPage, pageSize, query: 'availableOnline:false' },
        language: q.language ?? 'de',
      });
      const parsed = CoopSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) } as AdapterError);
      }
      const pageOffset = offset % pageSize;
      const list = ((parsed.data.products ?? []) as any[]).slice(pageOffset);
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
    // Coop has no working /aktionen or facet endpoint we've found that
    // returns just promo items — OCC-style facet filters (e.g. ?query=
    // :relevance:hasPromotion:true) are accepted but ignored, returning
    // the full catalog (~24k items).
    //
    // Strategy: when q.query is given, search for that and surface promo
    // items. When unspecified, fan out across a curated set of common
    // grocery seeds and dedupe by product code. Catches most weekly
    // Aktionen items (typically 30–80 unique promo products) without
    // burning the catalog scan budget.
    //
    // Conditional promos (e.g. "30% ab 2", flagPromotions populated but no
    // originalPrice) drop out — we can only express was/now reductions.
    try {
      const seeds = q.query?.trim()
        ? [q.query.trim()]
        : ['fleisch', 'gemüse', 'käse', 'getränk', 'milch', 'brot', 'fisch', 'früchte', 'aktion'];

      const responses = await Promise.all(
        seeds.map(async (seed) => {
          try {
            const r: any = await coopFetch(`/products/search/${encodeURIComponent(seed)}`, {
              query: { currentPage: 0, pageSize: 100, query: 'availableOnline:false' },
              language: q.language ?? 'de',
            });
            return (r?.products ?? []) as any[];
          } catch {
            return [];
          }
        }),
      );

      const seenCodes = new Set<string>();
      const onPromo: any[] = [];
      for (const list of responses) {
        for (const p of list) {
          const code = String(p?.code ?? '');
          if (!code || seenCodes.has(code)) continue;
          const hasFlag =
            p?.hasPromotion === true ||
            p?.weekPromotion === true ||
            p?.assortmentHitPromotion === true ||
            p?.megaStorePromotion === true;
          const hasFlatPrice =
            typeof p?.originalPrice?.value === 'number' &&
            typeof p?.price?.value === 'number' &&
            p.originalPrice.value > p.price.value;
          if (hasFlag && hasFlatPrice) {
            seenCodes.add(code);
            onPromo.push(p);
          }
        }
      }

      const promos: NormalizedPromotion[] = onPromo.map((raw) => {
        const np = normalizeProduct(raw);
        return {
          chain: 'coop' as const,
          productId: np.id,
          productName: np.name,
          price: np.price,
          description: typeof raw.discountPercentage === 'number'
            ? `-${raw.discountPercentage}%`
            : (raw.listPromotions?.[0] as string | undefined),
        };
      });
      // endingWithinDays: Coop search results don't carry per-item end dates,
      // so this filter is a no-op for this chain. Parameter still accepted.
      return ok(promos);
    } catch (e) {
      return err(classify(e));
    }
  }

  async findStoresWithStock(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>> {
    try {
      const point = near ?? { lat: 47.376, lng: 8.541 };
      // noCache: true — stock availability must always be fresh
      const r: any = await coopFetch('/locations/searchAroundCoordinates', {
        query: {
          latitude: point.lat, longitude: point.lng,
          availabilityProductId: productId,
          onlyWithAvailableProductId: 'true',
          currentPage: 0,
        },
        language: 'de',
        noCache: true,
      });
      const list = (r.locations ?? r.stores ?? []) as any[];
      return ok(list.map((raw) => ({ store: normalizeStore(raw), inStock: true })));
    } catch (e) {
      return err(classify(e));
    }
  }
}
