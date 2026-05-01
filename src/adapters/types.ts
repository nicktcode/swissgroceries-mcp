export type Chain = 'migros' | 'coop' | 'aldi' | 'denner' | 'lidl' | 'farmy' | 'volgshop' | 'ottos';

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'piece';

export type Tag =
  | 'organic'
  | 'budget'
  | 'premium'
  | 'fairtrade'
  | 'lactose-free'
  | 'gluten-free'
  | 'vegan'
  | 'vegetarian'
  | 'sugar-free'
  | 'regional'
  | 'swiss-made';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface WeekHours {
  mon?: string;
  tue?: string;
  wed?: string;
  thu?: string;
  fri?: string;
  sat?: string;
  sun?: string;
}

export interface NormalizedProduct {
  chain: Chain;
  id: string;
  name: string;
  brand?: string;
  size?: { value: number; unit: Unit };
  price: { current: number; regular?: number; currency: 'CHF' };
  unitPrice?: { value: number; per: 'kg' | 'l' | 'piece' };
  /**
   * For products sold as multipacks (e.g. "6x1.5l"), an estimate of what
   * a single unit would cost. Useful for cross-chain comparison when one
   * chain only stocks multipacks and the user wants a single bottle.
   * The estimate is derived from the multipack price ÷ pack count and is
   * not guaranteed to match the chain's actual single-unit price.
   */
  multipack?: {
    count: number;
    perUnitPrice: number;
    perUnitSize?: { value: number; unit: Unit };
  };
  category?: string[];
  tags: Tag[];
  imageUrl?: string;
  /**
   * Outbound URL to the chain's own product page. Lets consumers (web UI,
   * mobile, third-party clients) deep-link "buy here" without each having
   * to know each chain's URL pattern.
   *
   * Set when the adapter's response carries enough info to construct it
   * (slug + id, full URL, etc.). Undefined when the chain's API doesn't
   * expose URL data (Coop, Denner, Lidl currently). Coverage may improve
   * over time as adapters learn more upstream fields.
   */
  productUrl?: string;
  promotion?: { endsAt?: string; description?: string };
  raw?: unknown;
}

export interface NormalizedStore {
  chain: Chain;
  id: string;
  name: string;
  address: { street: string; zip: string; city: string };
  location: GeoPoint;
  hours?: WeekHours;
}

export interface NormalizedPromotion {
  chain: Chain;
  productId?: string;
  productName: string;
  /** Optional brand — surfaced when the chain provides it on the promo product. */
  brand?: string;
  /** Optional product image URL — adapter passes through from search/detail. */
  imageUrl?: string;
  /** Optional outbound URL to the chain's product page — same semantics as
   *  NormalizedProduct.productUrl. Same coverage caveats apply. */
  productUrl?: string;
  /** Optional pack size — same meaning as on NormalizedProduct. */
  size?: { value: number; unit: Unit };
  /** Optional unit price (per kg / l / piece). */
  unitPrice?: { value: number; per: 'kg' | 'l' | 'piece' };
  price?: { current: number; regular?: number; currency: 'CHF' };
  validFrom?: string;
  validUntil?: string;
  description?: string;
  storeIds?: string[];
}

export interface StockResult {
  store: NormalizedStore;
  inStock: boolean;
  quantity?: number;
}

export type AdapterError =
  | { code: 'unavailable'; reason: string }
  | { code: 'auth_expired'; reason: string }
  | { code: 'schema_mismatch'; sample: string }
  | { code: 'rate_limited'; retryAfterMs?: number }
  | { code: 'not_found' };

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdapterError };

export interface SearchQuery {
  query: string;
  storeIds?: string[];
  tags?: Tag[];
  maxPrice?: number;
  sizeRange?: { minMl?: number; maxMl?: number };
  limit?: number;
  offset?: number;
  language?: 'de' | 'fr' | 'it' | 'en';
}

export interface StoreQuery {
  near: GeoPoint;
  radiusKm?: number;
  limit?: number;
  cityHint?: string;  // free-text hint (city, region) for chains whose API requires a text query
}

export interface PromotionQuery {
  query?: string;
  endingWithinDays?: number;
  storeIds?: string[];
  language?: 'de' | 'fr' | 'it' | 'en';
}

export interface AdapterCapabilities {
  productSearch: boolean;
  productDetail: boolean;
  storeSearch: boolean;
  promotions: boolean;
  perStoreStock: boolean;
  perStorePricing: boolean;
}

export interface StoreAdapter {
  readonly chain: Chain;
  readonly capabilities: AdapterCapabilities;

  searchProducts(q: SearchQuery): Promise<AdapterResult<NormalizedProduct[]>>;
  getProduct(id: string): Promise<AdapterResult<NormalizedProduct | null>>;
  searchStores(q: StoreQuery): Promise<AdapterResult<NormalizedStore[]>>;
  getPromotions(q: PromotionQuery): Promise<AdapterResult<NormalizedPromotion[]>>;
  findStoresWithStock?(productId: string, near?: GeoPoint): Promise<AdapterResult<StockResult[]>>;
}
