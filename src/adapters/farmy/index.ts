import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { farmyFetch } from './client.js';
import { normalizeProduct, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { FarmySearchResponseSchema } from './schemas.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class FarmyAdapter implements StoreAdapter {
  readonly chain = 'farmy' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: false,        // Farmy is delivery-only
    promotions: true,
    perStoreStock: false,
    perStorePricing: false,
  };

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const limit = q.limit ?? 16;
      const offset = q.offset ?? 0;
      const page = Math.floor(offset / limit) + 1;
      const r = await farmyFetch('/api/products', {
        keywords: q.query,
        per_page: limit,
        page,
      });
      const parsed = FarmySearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      const list = (parsed.data.products ?? []) as any[];
      return ok(list.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      // Farmy has no documented per-product endpoint; refetch via id filter.
      const r = await farmyFetch('/api/products', { ids: id, per_page: 1 });
      const list = (r.products ?? []) as any[];
      const match = list.find((p) => String(p.id) === id) ?? list[0];
      return ok(match ? normalizeProduct(match) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(_q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    // Farmy is delivery-only; no physical stores.
    return ok([]);
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      // Farmy doesn't expose a promotion-only filter; fetch search results and
      // keep items with a strikeout_price.
      const r = await farmyFetch('/api/products', {
        keywords: q.query ?? '',
        per_page: 60,
      });
      const list = (r.products ?? []) as any[];
      const onSale = list.filter((p) => {
        const so = p.strikeout_price;
        if (so == null) return false;
        const n = typeof so === 'number' ? so : parseFloat(String(so));
        return Number.isFinite(n) && n > 0;
      });
      return ok(onSale.map(normalizePromotion));
    } catch (e) {
      return err(classify(e));
    }
  }
}
