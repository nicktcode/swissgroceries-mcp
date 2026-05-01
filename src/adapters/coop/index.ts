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

// Returns the upcoming Sunday at 23:59:59 in Europe/Zurich as an ISO string.
// Coop's weekly Aktionen always run Mon–Sun, so this is a reasonable default
// when the API itself doesn't expose per-product end dates.
function nextSundayEndOfDay(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  // 23:59:59 Europe/Zurich; subtract 1h or 2h depending on DST. Use 22:00:00
  // UTC during CEST and 23:00:00 UTC during CET. JS doesn't expose tz easily;
  // accept ±1h slack — the UI rounds to the date anyway.
  sunday.setUTCHours(22, 0, 0, 0);
  return sunday.toISOString();
}

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
    // Coop's "Aktuelle Highlights" are sourced from category m_1011 —
    // their actual Aktionen category. The category contains both the
    // flat-priced promos we want and conditional ones we drop. Endpoint
    // verified via Charles capture of the Coop iOS app (2026-05-01):
    //   /rest/v2/coopathome/products/category/m_1011?currentPage=N&pageSize=100&query=availableOnline:false
    //
    // Coop weekly Aktionen run Mon–Sun in Switzerland. The API doesn't
    // expose per-product end dates, so we set validUntil to the upcoming
    // Sunday end-of-day (Europe/Zurich). Adequate signal for the deals
    // UI and consistent with how Coop runs campaigns.
    try {
      const pages = 3; // 3 × 100 = up to 300 candidates per call
      const responses = await Promise.all(
        Array.from({ length: pages }, async (_, i) => {
          try {
            const r: any = await coopFetch('/products/category/m_1011', {
              query: { currentPage: i, pageSize: 100, query: 'availableOnline:false' },
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

      // Optional q.query filter: substring match against product name/title.
      const needle = q.query?.trim().toLowerCase();
      const filtered = needle
        ? onPromo.filter((p) => {
            const name = String(p?.title ?? p?.name ?? '').toLowerCase();
            return name.includes(needle);
          })
        : onPromo;

      // Coop weekly Aktionen end Sunday 23:59:59 Europe/Zurich. Compute
      // next Sunday end-of-day; if today IS Sunday, use today.
      const validUntil = nextSundayEndOfDay();

      const promos: NormalizedPromotion[] = filtered.map((raw) => {
        const np = normalizeProduct(raw);
        return {
          chain: 'coop' as const,
          productId: np.id,
          productName: np.name,
          brand: np.brand,
          imageUrl: np.imageUrl,
          size: np.size,
          unitPrice: np.unitPrice,
          price: np.price,
          validUntil,
          description: typeof raw.discountPercentage === 'number'
            ? `-${raw.discountPercentage}%`
            : (raw.listPromotions?.[0] as string | undefined),
        };
      });

      let result = promos;
      if (q.endingWithinDays !== undefined) {
        const cutoff = Date.now() + q.endingWithinDays * 24 * 3600 * 1000;
        result = result.filter((p) => p.validUntil && Date.parse(p.validUntil) <= cutoff);
      }
      return ok(result);
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
