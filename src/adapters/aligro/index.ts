import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { aligroSearchRaw } from './client.js';
import { normalizeProduct, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { AligroSearchContainerSchema } from './schemas.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  if (/island_not_found/.test(msg)) return { code: 'schema_mismatch', sample: msg.slice(0, 200) };
  return { code: 'unavailable', reason: msg };
}

/**
 * Aligro (Groupe Demaurex cash & carry, French-speaking Switzerland).
 *
 * Aligro publishes prices online ONLY for items currently "en action" (weekly
 * promotions); regular catalogue prices are in-store only. The adapter is
 * therefore strongest on promotions and returns priced items from search;
 * out-of-action items are dropped (no price to expose). Uniquely, Aligro can
 * surface NEXT week's promotions via the client's `nextWeek` option.
 */
export class AligroAdapter implements StoreAdapter {
  readonly chain = 'aligro' as const;
  readonly capabilities = {
    productSearch: true, // returns only in-action (priced) items
    productDetail: false, // no per-SKU JSON endpoint carrying a price
    storeSearch: false, // /api/markets/ exposes names only, no geo
    promotions: true, // core strength: keyword-scoped weekly promotions
    perStoreStock: false,
    perStorePricing: false,
  };

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const raw = await aligroSearchRaw(q.query, { page: 1 });
      const parsed = AligroSearchContainerSchema.safeParse(raw);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(raw).slice(0, 500) });
      }
      const limit = q.limit ?? 24;
      const items = (parsed.data.items ?? [])
        .map(normalizeProduct)
        .filter((p): p is NormalizedProduct => p !== null)
        .slice(0, limit);
      return ok(items);
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(_id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    // Aligro has no per-SKU JSON detail endpoint carrying a price.
    return ok(null);
  }

  async searchStores(_q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    // /api/markets/ lists market names only (no address/geo), so a
    // distance-based store search cannot be answered honestly.
    return err({ code: 'unavailable', reason: 'Aligro markets API exposes names only, no geo' });
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      // Aligro's whole site is its weekly "actions" catalogue, but the results
      // are keyword-scoped — there is no meaningful all-promos query.
      if (!q.query || !q.query.trim()) {
        return err({ code: 'unavailable', reason: 'Aligro promotions require a search keyword' });
      }
      const raw = await aligroSearchRaw(q.query, { page: 1 });
      const parsed = AligroSearchContainerSchema.safeParse(raw);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(raw).slice(0, 500) });
      }
      const promos = (parsed.data.items ?? [])
        .map(normalizePromotion)
        .filter((p): p is NormalizedPromotion => p !== null);
      return ok(promos);
    } catch (e) {
      return err(classify(e));
    }
  }
}
