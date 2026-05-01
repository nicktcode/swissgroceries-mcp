import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  StockResult, GeoPoint,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { ottosFetch } from './client.js';
import {
  normalizeProduct, normalizePromotion, normalizeStore, normalizeStockResult, isGroceryProduct,
} from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';
import {
  OttosSearchResponseSchema, OttosStoreSearchResponseSchema, OttosStockResponseSchema,
} from './schemas.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

// OCC v2's `fields=DEFAULT` and `fields=FULL` shortcuts do NOT include
// `insteadOfPrice` — promotions only surface when explicitly requested.
// This selector mirrors the Otto's iOS app's request shape.
const OTTOS_FIELDS = [
  'products(',
  'code,name,brand,description,url,unitName,purchasable,productLabels,',
  'categories(name,code,excludeFromProductBreadcrumb),',
  'price(FULL),insteadOfPrice(FULL),basePrice(FULL),',
  'images(DEFAULT),stock(FULL)',
  '),',
  'pagination(DEFAULT),facets(name)',
].join('');

export class OttosAdapter implements StoreAdapter {
  readonly chain = 'ottos' as const;
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
      const limit = q.limit ?? 16;
      const offset = q.offset ?? 0;
      const currentPage = Math.floor(offset / limit);
      // OCC v2 supports `pageSize` cap of 100 per request. Over-fetch when filtering by category.
      const r = await ottosFetch('/products/search', {
        query: `${q.query}:relevance`,
        pageSize: Math.min(limit * 3, 100),
        currentPage,
        lang: q.language === 'fr' ? 'fr' : q.language === 'it' ? 'it' : 'de',
        curr: 'CHF',
        fields: OTTOS_FIELDS,
      });
      const parsed = OttosSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const list = (parsed.data.products ?? []) as any[];
      const groceryOnly = list.filter(isGroceryProduct).slice(0, limit);
      return ok(groceryOnly.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const r = await ottosFetch(`/products/${encodeURIComponent(id)}`, {
        fields: 'FULL',
        lang: 'de',
        curr: 'CHF',
      });
      return ok(r ? normalizeProduct(r) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      const radius = q.radiusKm ?? 10;
      const r = await ottosFetch('/stores', {
        latitude: q.near.lat,
        longitude: q.near.lng,
        radius,
        // fields=DEFAULT only returns todaySchedule; FULL gives the full
        // weekDayOpeningList we need for normalizeStore's hours map.
        fields: 'FULL',
      });
      const parsed = OttosStoreSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const stores = (parsed.data.stores ?? []).map(normalizeStore);
      const filtered = stores.filter((s) => haversineKm(q.near, s.location) <= radius);
      const limited = q.limit ? filtered.slice(0, q.limit) : filtered;
      return ok(limited);
    } catch (e) {
      return err(classify(e));
    }
  }

  async findStoresWithStock(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>> {
    try {
      // OCC requires lat/lng on this endpoint to populate distance + ordering.
      // Fall back to Zürich centre when caller does not pass coordinates.
      const lat = near?.lat ?? 47.3769;
      const lng = near?.lng ?? 8.5417;
      const r = await ottosFetch(`/products/${encodeURIComponent(productId)}/stock`, {
        latitude: lat,
        longitude: lng,
        onlyOpen: 'false',
        hideOutOfStock: 'false',
        currentPage: 0,
        lang: 'de',
        curr: 'CHF',
        fields: 'DEFAULT,stores(DEFAULT,features)',
      });
      const parsed = OttosStockResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const list = (parsed.data.stores ?? []).map(normalizeStockResult);
      return ok(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return err({ code: 'not_found' });
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      // Otto's exposes a `priceLabels:priceDiscount` facet that flags items
      // with a real was-price (insteadOfPrice). The "Aktionen" category
      // (m_1000) by contrast is a curated/featured selection, not a
      // discount filter — many m_1000 items have no insteadOfPrice at all.
      // Issue one request per grocery-adjacent root category and merge,
      // since OCC's category filter can't be OR'd in a single query.
      const roots = ['m_10000', 'm_20000', 'm_30000'];
      const lang = q.language === 'fr' ? 'fr' : q.language === 'it' ? 'it' : 'de';
      const text = q.query ?? '';
      const results = await Promise.all(
        roots.map((cat) =>
          ottosFetch('/products/search', {
            query: `${text}:relevance:category:${cat}:priceLabels:priceDiscount`,
            pageSize: 80,
            lang,
            curr: 'CHF',
            fields: OTTOS_FIELDS,
          }).then((r) => (r.products ?? []) as any[])
            .catch(() => [] as any[]),
        ),
      );
      const merged = results.flat();
      // Drop duplicates by product code; keep only items with a real reduction.
      const seen = new Set<string>();
      const dedup = merged.filter((p) => {
        const code = p.code ?? '';
        if (!code || seen.has(code)) return false;
        seen.add(code);
        const cur = p.price?.value;
        const reg = p.insteadOfPrice?.value;
        return typeof cur === 'number' && typeof reg === 'number' && reg > cur;
      });
      // Promote raw → normalizeProduct → NormalizedPromotion so we surface
      // imageUrl, brand, size, and unitPrice on the deals UI.
      return ok(
        dedup.map((raw) => {
          const np = normalizeProduct(raw);
          const base = normalizePromotion(raw);
          return {
            ...base,
            brand: np.brand,
            imageUrl: np.imageUrl,
            size: np.size,
            unitPrice: np.unitPrice,
          };
        }),
      );
    } catch (e) {
      return err(classify(e));
    }
  }
}
