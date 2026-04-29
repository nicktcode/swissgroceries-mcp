import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { volgshopFetch } from './client.js';
import { normalizeProduct, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { VolgshopSearchResponseSchema } from './schemas.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class VolgshopAdapter implements StoreAdapter {
  readonly chain = 'volgshop' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: false,        // Volgshop is delivery-only; physical Volg stores are not on this site
    promotions: true,
    perStoreStock: false,
    perStorePricing: false,
  };

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const limit = q.limit ?? 16;
      const offset = q.offset ?? 0;
      const page = Math.floor(offset / limit) + 1;
      const r = await volgshopFetch('/wp-json/wc/store/v1/products', {
        search: q.query,
        per_page: limit,
        page,
      });
      const parsed = VolgshopSearchResponseSchema.safeParse(r);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(r).slice(0, 500) });
      }
      return ok(parsed.data.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const r = await volgshopFetch(`/wp-json/wc/store/v1/products/${encodeURIComponent(id)}`);
      // Single-product endpoint returns a single object (not array).
      return ok(r ? normalizeProduct(r) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/404/.test(msg)) return ok(null);
      return err(classify(e));
    }
  }

  async searchStores(_q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    // Volg has ~600 physical stores but volgshop.ch is delivery-only.
    return ok([]);
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      // Store API supports `on_sale=true` filter natively.
      const r = await volgshopFetch('/wp-json/wc/store/v1/products', {
        search: q.query ?? '',
        on_sale: 'true',
        per_page: 60,
      });
      const list = Array.isArray(r) ? r : [];
      return ok(list.map(normalizePromotion));
    } catch (e) {
      return err(classify(e));
    }
  }
}
