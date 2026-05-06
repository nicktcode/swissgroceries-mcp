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
  /**
   * Top-level department the chain assigns this product to (Migros's
   * 'Früchte & Gemüse', Coop's 'lebensmittel/fruechte-gemuese', etc.).
   * Stable id + display name — chains rarely renumber their top-level
   * taxonomy. Lets consumers map to their own canonical buckets and do
   * single-bucket-per-product filtering instead of token-soup matching
   * across breadcrumb levels.
   *
   * Set when the adapter can extract a clear top-level department from
   * the chain's structured response. Undefined for chains that don't
   * expose one (Lidl) or for individual products with empty categories.
   */
  department?: { id: string; name: string };
  /**
   * Where the product can be bought. Some chains return products that
   * exist only in physical stores (no online listing), and consumers
   * should know to hide outbound 'buy now' CTAs for those.
   *
   *   'online'      — orderable online (default for chains with web shops)
   *   'store-only'  — physical-store inventory only, no online page
   *   'both'        — explicitly marked available on both surfaces
   *
   * Undefined when the adapter has no signal (most chains today). Set
   * by Lidl adapter where the API is explicit (isOnline / isStore).
   */
  availability?: 'online' | 'store-only' | 'both';
  /**
   * Nutrient values for the product, normalized to a per-100g or per-100ml
   * basis so consumers can sort/filter cross-chain ("highest protein per
   * 100g lasagne" etc.). All numeric fields are in grams except energy.
   *
   * Coverage varies — chains expose it on different surfaces and not at
   * all for every SKU. Set when the adapter could parse a clear table;
   * undefined otherwise. Adapters should not fabricate values: if a row
   * is missing or non-numeric, leave the field undefined rather than
   * defaulting to 0.
   *
   * Currently populated by:
   *   - Migros (product detail)
   *   - Coop   (product detail)
   *   - Volgshop (search response, parsed from a free-text blob)
   *
   * Aldi/Lidl/Denner/Farmy/Ottos do not expose macronutrients in their
   * APIs as of this writing.
   */
  nutrition?: Nutrition;
  promotion?: { endsAt?: string; description?: string };
  raw?: unknown;
}

export interface Nutrition {
  /** Reference quantity the values are expressed against — typically 100g/100ml. */
  basis: { value: number; unit: 'g' | 'ml' };
  /** Energy in kilojoules. */
  energyKj?: number;
  /** Energy in kilocalories. */
  energyKcal?: number;
  /** Total fat, grams. */
  fat?: number;
  /** Saturated fat, grams. */
  saturatedFat?: number;
  /** Total carbohydrates, grams. */
  carbs?: number;
  /** Of-which sugars, grams. */
  sugar?: number;
  /** Dietary fibre, grams. */
  fiber?: number;
  /** Protein, grams. */
  protein?: number;
  /** Salt, grams. */
  salt?: number;
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
