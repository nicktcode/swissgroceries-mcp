import type {
  StoreAdapter, AdapterResult, AdapterError,
  NormalizedProduct, NormalizedStore, NormalizedPromotion,
  SearchQuery, StoreQuery, PromotionQuery,
} from '../types.js';
import { makeDennerClient, type DennerClient } from './client.js';
import { normalizeProduct, normalizeStore, normalizePromotion } from './normalize.js';
import { ok, err } from '../../util/adapter-result.js';
import { haversineKm } from '../../util/haversine.js';

function classify(e: unknown): AdapterError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/auth_expired/i.test(msg)) return { code: 'auth_expired', reason: msg };
  if (/429/.test(msg)) return { code: 'rate_limited' };
  if (/404/.test(msg)) return { code: 'not_found' };
  return { code: 'unavailable', reason: msg };
}

export class DennerAdapter implements StoreAdapter {
  readonly chain = 'denner' as const;
  readonly capabilities = {
    productSearch: true,
    productDetail: true,
    storeSearch: true,
    promotions: true,
    perStoreStock: false,
    perStorePricing: false,
  };

  private cache: { products?: any[]; publications?: any[]; expires?: number } = {};
  private client: DennerClient = makeDennerClient(process.env.DENNER_JWT ?? '');

  private async loadContent(): Promise<{ products: any[]; publications: any[] }> {
    if (this.cache.products && this.cache.expires && Date.now() < this.cache.expires) {
      return { products: this.cache.products, publications: this.cache.publications ?? [] };
    }
    const r = await this.client.fetch('/api/m/content/v2', { v: 0 });
    this.cache = {
      products: (r.products ?? []) as any[],
      publications: (r.publications ?? []) as any[],
      expires: Date.now() + 5 * 60 * 1000,
    };
    return { products: this.cache.products!, publications: this.cache.publications! };
  }

  async searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>> {
    try {
      const { products } = await this.loadContent();
      const needle = q.query.toLowerCase();
      const matches = products
        .filter((p: any) => {
          const name = typeof p.title === 'string'
            ? p.title
            : (p.title?.de ?? p.title?.fr ?? p.title?.it ?? '');
          return name.toLowerCase().includes(needle);
        })
        .slice(0, q.limit ?? 20);
      return ok(matches.map(normalizeProduct));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>> {
    try {
      const { products } = await this.loadContent();
      const found = products.find((p: any) => String(p.id) === id);
      return ok(found ? normalizeProduct(found) : null);
    } catch (e) {
      return err(classify(e));
    }
  }

  async searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>> {
    try {
      const r = await this.client.fetch('/api/m/stores');
      const list = (r.stores ?? r) as any[];
      const radius = q.radiusKm ?? 5;
      return ok(list.map(normalizeStore).filter((s) => haversineKm(q.near, s.location) <= radius));
    } catch (e) {
      return err(classify(e));
    }
  }

  async getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>> {
    try {
      const { products } = await this.loadContent();
      let promos = products.map(normalizePromotion);
      if (q.query) {
        const needle = q.query.toLowerCase();
        promos = promos.filter((p) => p.productName.toLowerCase().includes(needle));
      }
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
