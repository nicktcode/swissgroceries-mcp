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

// Migros region ID for product search + product-detail bodies. The SDK
// defaults to Region.NATIONAL ('national') which only returns prices for
// products that have national-level pricing — region-specific produce like
// Spargeln come back with `offer.price: {}`. The migros.ch website itself
// uses regionId "2" by default for unauthenticated visitors (Genossenschaft
// Zürich, the largest Migros co-op). Switching MCP to the same default
// surfaces prices for the bulk of regional products.
//
// Override via SWISSGROCERIES_MIGROS_REGION_ID for callers in other
// regions, e.g. "1" (Aare), "3" (Luzern), etc.
const MIGROS_REGION_ID: string = process.env.SWISSGROCERIES_MIGROS_REGION_ID || '2';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { MigrosProductDetailsResponseSchema } from './schemas.js';
import { haversineKm } from '../../util/haversine.js';
import { nearbyZips } from '../../services/geocoding.js';

// How many PLZ queries one searchStores call may fan out to. Each returns at
// most 10 text-ranked stores; 6 covers a dense city centre at 5 km.
const MIGROS_STORE_ZIP_QUERIES = 6;
// store-availability rejects (HTTP 400) more than ~10 costCenterIds per call.
const MIGROS_STOCK_BATCH = 10;

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
  private uidCache = new Map<string, string>();

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
        regionId: MIGROS_REGION_ID,
      } as any));
      // r = { productIds: number[], numberOfProducts: number, ... }
      const productIds: number[] = (r as any).productIds ?? [];
      if (productIds.length === 0) return ok([]);
      const offset = q.offset ?? 0;
      const uids = productIds.slice(offset, offset + (q.limit ?? 20)).map(String);
      const det = await this.withAuthRetry(() => this.api.products.productDisplay.getProductDetails({ uids, language: q.language ?? 'de', region: MIGROS_REGION_ID } as any));
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

  /**
   * Product IDs we expose are `migrosId`s (12 digits, e.g. "131110100000"),
   * but product-detail and store-availability only accept the internal
   * catalogue `uid` (9 digits, e.g. "100139240"). Searching for a migrosId
   * returns exactly its uid, so resolve through search and memoize.
   * Anything that isn't migrosId-shaped is assumed to already be a uid.
   */
  private async resolveUid(id: string): Promise<string | null> {
    if (!/^\d{12}$/.test(id)) return id;
    const cached = this.uidCache.get(id);
    if (cached) return cached;
    const r: any = await this.withAuthRetry(() => this.api.products.productSearch.searchProduct({
      query: id,
      language: 'de',
      regionId: MIGROS_REGION_ID,
    } as any));
    const uid = r?.productIds?.[0];
    if (uid === undefined) return null;
    this.uidCache.set(id, String(uid));
    return String(uid);
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const uid = await this.resolveUid(id);
      if (!uid) return ok(null);
      const r = await this.withAuthRetry(() => this.api.products.productDisplay.getProductDetails({ uids: [uid], language: 'de', region: MIGROS_REGION_ID } as any));
      const products = Object.values(r as Record<string, unknown>);
      const first = products[0];
      return ok(first ? normalizeProduct(first) : null);
    } catch (e) {
      return err(classifyError(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      // The store endpoint is text-ranked and returns at most 10 hits; it
      // ignores lat/lng and paging params. A city name ("Zürich") spreads
      // those 10 across the canton and an empty query returns stores in
      // alphabetical order, so query by PLZ instead: the centre ZIP plus
      // neighbouring ZIPs inside the radius, then dedupe + radius-filter.
      const radius = q.radiusKm ?? 5;
      const zipQueries = nearbyZips(q.near, radius, MIGROS_STORE_ZIP_QUERIES);
      const queries = zipQueries.length ? zipQueries : [q.cityHint ?? ''];
      // searchStores does NOT require auth token per source — but we ensureAuth + retry anyway for consistency
      const responses: any[] = await Promise.all(
        queries.map((query) => this.withAuthRetry(() => this.api.stores.searchStores({ query } as any))),
      );
      const byId = new Map<string, NormalizedStore>();
      for (const r of responses) {
        // r is a plain array or { stores: [...] }
        for (const raw of ((r as any).stores ?? r) as any[]) {
          const s = normalizeStore(raw);
          if (s.id && !byId.has(s.id) && haversineKm(q.near, s.location) <= radius) byId.set(s.id, s);
        }
      }
      const normalized = [...byId.values()].sort(
        (a, b) => haversineKm(q.near, a.location) - haversineKm(q.near, b.location),
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

      // Migros's promotion-search returns ~55 product items per week plus
      // ~45 GROUP_PROMOTION entries (category-level discounts that can't
      // be expressed as individual deal cards). Take all PRODUCT items.
      const productIds = items
        .filter((it) => !it.type || it.type === 'PRODUCT')
        .map((it) => String(it.id))
        .slice(0, 100);

      if (productIds.length === 0) return ok([]);

      const detailsR: any = await this.api.products.productDisplay.getProductDetails({
        uids: productIds,
        language: q.language ?? 'de',
        region: MIGROS_REGION_ID,
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
          brand: np.brand,
          imageUrl: np.imageUrl,
          productUrl: np.productUrl,
          size: np.size,
          unitPrice: np.unitPrice,
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
      if (storesRes.data.length === 0) return ok([]);
      // store-availability is keyed by catalogue uid, not migrosId.
      const uid = await this.resolveUid(productId);
      if (!uid) return err({ code: 'not_found' });
      // costCenterIds takes a comma-separated list but 400s above ~10 ids,
      // so batch in chunks of MIGROS_STOCK_BATCH.
      // Response: { availabilities: [{ id: costCenterId, stock: n }], catalogItemId }
      const ids = storesRes.data.map((s) => s.id);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += MIGROS_STOCK_BATCH) chunks.push(ids.slice(i, i + MIGROS_STOCK_BATCH));
      const responses: any[] = await Promise.all(chunks.map((chunk) =>
        this.withAuthRetry(() => this.api.products.productStock.getProductSupply({
          pids: uid,
          costCenterIds: chunk.join(','),
        } as any)),
      ));
      const stockById = new Map<string, number>();
      for (const r of responses) {
        for (const a of (r?.availabilities ?? []) as Array<{ id?: string; stock?: number }>) {
          if (a.id !== undefined && typeof a.stock === 'number') stockById.set(String(a.id), a.stock);
        }
      }
      // Stores missing from availabilities don't carry the item.
      return ok(storesRes.data.map((store) => {
        const quantity = stockById.get(store.id);
        return { store, inStock: (quantity ?? 0) > 0, quantity };
      }));
    } catch (e) {
      return err(classifyError(e));
    }
  }
}
