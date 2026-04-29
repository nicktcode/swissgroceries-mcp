import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { ottosFetch } from './client.js';
import { normalizeProduct, normalizePromotion, isGroceryProduct } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { OttosSearchResponseSchema } from './schemas.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class OttosAdapter implements StoreAdapter {
  readonly chain = 'ottos' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: false,        // Otto's has ~110 stores; not exposed in this adapter
    promotions: true,
    perStoreStock: false,
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
        fields: 'DEFAULT',
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

  async searchStores(_q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    return ok([]);
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      // Use the "Aktionen" category (m_1000) for current promotions.
      const r = await ottosFetch('/products/search', {
        query: `${q.query ?? ''}:relevance:category:m_1000`,
        pageSize: 60,
        lang: q.language === 'fr' ? 'fr' : q.language === 'it' ? 'it' : 'de',
        curr: 'CHF',
        fields: 'DEFAULT',
      });
      const list = (r.products ?? []) as any[];
      const groceryOnly = list.filter(isGroceryProduct);
      return ok(groceryOnly.map(normalizePromotion));
    } catch (e) {
      return err(classify(e));
    }
  }
}
