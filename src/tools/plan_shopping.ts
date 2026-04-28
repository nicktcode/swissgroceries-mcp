import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import { plan, type PlanResult } from '../services/planner.js';
import { geocode } from '../services/geocoding.js';
import { ToolError } from './errors.js';

const TAG_VALUES = ['organic','budget','premium','fairtrade','lactose-free','gluten-free','vegan','vegetarian','sugar-free','regional','swiss-made'] as const;

const itemSchema = z.object({
  query: z.string().min(1)
    .describe('Product search term, e.g. "Milch", "pasta integrale". The planner searches this across chains.'),
  quantity: z.number().int().positive()
    .optional()
    .describe('Number of units needed (default 1). Used for total cost calculation.'),
  preferredChain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])
    .optional()
    .describe('Prefer this chain for this item when scores are tied. Useful for loyalty card preferences.'),
  preferredProductId: z.object({
    chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])
      .describe('Chain the pinned product belongs to.'),
    id: z.string()
      .describe('Exact product ID to use for this line item; bypasses search.'),
  }).optional()
    .describe('Pin a specific product by chain + ID. If set, query is ignored for product selection.'),
  filters: z.object({
    tags: z.array(z.enum(TAG_VALUES))
      .optional()
      .describe('Require all listed tags on matching products, e.g. ["organic", "vegan"].'),
    maxPrice: z.number().positive()
      .optional()
      .describe('Reject products above this CHF price per unit.'),
    sizeRange: z.object({
      minMl: z.number().nonnegative().optional().describe('Minimum size in ml.'),
      maxMl: z.number().nonnegative().optional().describe('Maximum size in ml.'),
    }).optional()
      .describe('Size range filter in millilitres; useful for beverages.'),
  }).optional()
    .describe('Optional product constraints applied when searching for this item.'),
}).describe('A single item in the shopping list.');

export const planShoppingSchema = z.object({
  items: z.array(itemSchema).min(1)
    .describe('The list of items to shop for. At least one item required.'),
  near: z.union([
    z.object({
      lat: z.number().describe('Latitude in decimal degrees (WGS 84).'),
      lng: z.number().describe('Longitude in decimal degrees (WGS 84).'),
    }).describe('GPS coordinates of the shopper\'s location'),
    z.object({
      zip: z.string().describe('Swiss postal code (PLZ / NPA), e.g. "8001".'),
    }).describe('Swiss postal code (PLZ), e.g. "8001"'),
    z.object({
      address: z.string().describe('Free-text address string (limited support — prefer zip or lat/lng).'),
    }).describe('Free-text address (limited support — prefer zip or lat/lng)'),
  ]).describe('Shopper\'s location — used to find nearby stores. Pass coordinates, ZIP, or address.'),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']))
    .optional()
    .describe('Restrict the plan to these chains. Omit to consider all configured chains.'),
  strategy: z.enum(['single_store', 'split_cart', 'absolute_cheapest'])
    .describe([
      'single_store: buy everything at one chain (minimises trips).',
      'split_cart: allow multiple chains but add splitPenaltyChf per extra stop.',
      'absolute_cheapest: pick the cheapest source per item regardless of stops.',
    ].join(' ')),
  splitPenaltyChf: z.number().nonnegative()
    .optional()
    .describe('Cost in CHF added per extra store stop in split_cart strategy. Default 2.00.'),
  radiusKm: z.number().positive().max(50)
    .optional()
    .describe('Only consider stores within this radius of the provided location (1–50 km). Default 5 km.'),
}).describe([
  'Plan a multi-store shopping trip near a location, picking the best products across configured Swiss grocery chains.',
  'Items can be generic ("milch", "pasta") or pinned to a specific SKU. Returns a primary plan plus alternatives.',
  'Use when the user gives a list of items and asks "where should I shop?" or "what\'s cheapest?".',
  'Strategies: single_store (one chain), split_cart (multi-chain with stop penalty), absolute_cheapest (no penalty).',
].join(' '));

export type PlanShoppingInput = z.infer<typeof planShoppingSchema>;

export async function planShoppingHandler(
  registry: AdapterRegistry,
  input: PlanShoppingInput,
): Promise<PlanResult> {
  const geo = geocode(input.near as any);
  if (!geo.ok) {
    const err = geo.error;
    if (err.code === 'unknown_zip') {
      throw new ToolError(
        'unknown_zip',
        `ZIP "${(err as any).zip}" is not in the lookup table`,
        'Pass { lat, lng } directly or check that the ZIP is a valid Swiss PLZ (e.g. "8001").',
      );
    }
    throw new ToolError(
      err.code,
      'address_unsupported' in err ? (err as any).reason : err.code,
      'Pass a Swiss ZIP code or { lat, lng } coordinates instead of a free-text address.',
    );
  }

  return plan(registry, {
    items: input.items,
    near: { lat: geo.data.lat, lng: geo.data.lng, city: geo.data.city },
    chains: input.chains,
    strategy: input.strategy,
    splitPenaltyChf: input.splitPenaltyChf,
    radiusKm: input.radiusKm,
  });
}
