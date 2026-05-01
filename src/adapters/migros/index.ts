// MigrosAdapter — wraps migros-api-wrapper with guest-token auth.
//
// Key API shape divergences from plan:
//   - Wrapper exports { MigrosAPI } (named), not a default object.
//   - Auth: must call api.account.oauth2.loginGuestToken() before any product call.
//   - searchProduct returns { productIds: number[], ... } — NOT product objects.
//   - getProductDetails expects { uids: string[], ... } and returns {"0":{...}, "1":{...}}.
//   - searchStores returns a plain array (not wrapped).
//   - getProductPromotionSearch returns { items: [{id, type},...], numberOfItems, startDate, endDate }.
// Note: migros-api-wrapper does its own fetching internally and is not wrapped
// with httpJson — the wrapper manages auth tokens and request lifecycle.
// Caching, retry, and rate-limiting for Migros must be handled at the adapter
// level or deferred to a future wrapper replacement.
import { MigrosAPI } from 'migros-api-wrapper';
import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion, StockResult,
  SearchQuery, StoreQuery, PromotionQuery, GeoPoint,
} from '../types.js';
import { logger } from '../../util/log.js';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { MigrosProductDetailsResponseSchema } from './schemas.js';
import { haversineKm } from '../../util/haversine.js';

function classifyError(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/401|403|token|auth/i.test(msg)) return { code: 'auth_expired', reason: msg };
  if (/429|rate limit/i.test(msg))     return { code: 'rate_limited' };
  if (/404/.test(msg))                 return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class MigrosAdapter implements StoreAdapter {
  readonly chain = 'migros' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: true,
    promotions: true,
    perStoreStock: true,
    perStorePricing: false,
  };

  private api: MigrosAPI;
  private authPromise: Promise<void> | null = null;

  constructor() {
    this.api = new MigrosAPI();
  }

  /** Lazily obtains a guest token on first call; coalesces concurrent callers. */
  private ensureAuth(): Promise<void> {
    if (!this.authPromise) {
      this.authPromise = (async () => {
        await this.api.account.oauth2.loginGuestToken();
      })().catch((e) => {
        this.authPromise = null;
        throw e;
      });
    }
    return this.authPromise;
  }

  /** Force re-auth on the next ensureAuth() call (e.g. after a 401 mid-session). */
  private invalidateAuth(): void {
    this.authPromise = null;
  }

  /**
   * Wraps an API call with one retry on auth_expired: if the call surfaces a 401/403,
   * we drop the cached guest token, re-auth, and retry once. Real expired-token
   * recoveries pass through transparently; programmer errors still bubble up.
   */
  private async withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await fn();
    } catch (e) {
      const err = classifyError(e);
      if (err.code !== 'auth_expired') throw e;
      this.invalidateAuth();
      await this.ensureAuth();
      return fn();
    }
  }

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const r = await this.withAuthRetry(() => this.api.products.productSearch.searchProduct({
        query: q.query,
        language: q.language ?? 'de',
      } as any));
      // r = { productIds: number[], numberOfProducts: number, ... }
      const productIds: number[] = (r as any).productIds ?? [];
      if (productIds.length === 0) return ok([]);
      const offset = q.offset ?? 0;
      const uids = productIds.slice(offset, offset + (q.limit ?? 20)).map(String);
      const det = await this.withAuthRetry(() => this.api.products.productDisplay.getProductDetails({ uids, language: q.language ?? 'de' } as any));
      // det = {"0": product, "1": product, ...}
      const parsed = MigrosProductDetailsResponseSchema.safeParse(det);
      if (!parsed.success) {
        return err({ code: 'schema_mismatch', sample: JSON.stringify(det).slice(0, 500) } as AdapterError);
      }
      const products = (Array.isArray(parsed.data) ? parsed.data : Object.values(parsed.data)) as any[];
      return ok(products.map(normalizeProduct));
    } catch (e) {
      return err(classifyError(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      // id is a uid (numeric string)
      const r = await this.withAuthRetry(() => this.api.products.productDisplay.getProductDetails({ uids: [id], language: 'de' } as any));
      const products = Object.values(r as Record<string, unknown>);
      const first = products[0];
      return ok(first ? normalizeProduct(first) : null);
    } catch (e) {
      return err(classifyError(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      // searchStores does NOT require auth token per source — but we ensureAuth + retry anyway for consistency
      const query = q.cityHint ?? '';
      const r: any = await this.withAuthRetry(() => this.api.stores.searchStores({ query } as any));
      // r is a plain array of store objects
      const list = ((r as any).stores ?? r) as any[];
      const radius = q.radiusKm ?? 5;
      const normalized = list.map(normalizeStore).filter(
        (s) => haversineKm(q.near, s.location) <= radius,
      );
      return ok(normalized);
    } catch (e) {
      return err(classifyError(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      const r = await this.withAuthRetry(() => this.api.products.productDisplay.getProductPromotionSearch({
        query: q.query ?? '',
        language: q.language ?? 'de',
      } as any));
      // r = { items: [{id, type},...], numberOfItems, startDate, endDate }
      const items = ((r as any).items ?? []) as Array<{ id: number | string; type?: string }>;
      const startDate: string | undefined = (r as any).startDate;
      const endDate: string | undefined = (r as any).endDate;

      const productIds = items
        .filter((it) => !it.type || it.type === 'PRODUCT')
        .map((it) => String(it.id))
        .slice(0, 50);

      if (productIds.length === 0) return ok([]);

      const detailsR: any = await this.api.products.productDisplay.getProductDetails({
        uids: productIds,
        language: q.language ?? 'de',
      } as any);
      const products = (Array.isArray(detailsR) ? detailsR : Object.values(detailsR as Record<string, unknown>)) as any[];

      let promos: NormalizedPromotion[] = products.map((raw) => {
        const np = normalizeProduct(raw);
        // Prefer per-product promotion end date when present; fall back to
        // the campaign-wide endDate from the search response.
        const perProductEnd = raw?.offer?.promotionDateRange?.endDate as string | undefined;
        return {
          chain: 'migros' as const,
          productId: np.id,
          productName: np.name,
          price: np.price,
          validFrom: raw?.offer?.promotionDateRange?.startDate ?? startDate,
          validUntil: perProductEnd ?? endDate,
          description: np.promotion?.description,
        };
      });

      if (q.endingWithinDays !== undefined) {
        const cutoff = Date.now() + q.endingWithinDays * 24 * 3600 * 1000;
        promos = promos.filter((p) => p.validUntil && Date.parse(p.validUntil) <= cutoff);
      }
      return ok(promos);
    } catch (e) {
      return err(classifyError(e));
    }
  }

  async findStoresWithStock(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>> {
    try {
      const storesRes = await this.searchStores({ near: near ?? { lat: 47.376, lng: 8.541 }, radiusKm: 5 });
      if (!storesRes.ok) return storesRes;
      const checks = await Promise.all(
        storesRes.data.map(async (store) => {
          try {
            const r = await this.withAuthRetry(() => this.api.products.productStock.getProductSupply({ productId, storeId: store.id } as any));
            return { store, inStock: !!((r as any).available ?? (r as any).inStock), quantity: (r as any).quantity };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.debug(`[migros] stock check failed for store ${store.id}: ${msg}`);
            return { store, inStock: false };
          }
        }),
      );
      return ok(checks);
    } catch (e) {
      return err(classifyError(e));
    }
  }
}
