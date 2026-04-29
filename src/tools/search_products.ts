import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { Chain, NormalizedProduct } from '../adapters/types.js';

const TAG_VALUES = [
  'organic','budget','premium','fairtrade','lactose-free','gluten-free',
  'vegan','vegetarian','sugar-free','regional','swiss-made',
] as const;

export const searchProductsSchema = z.object({
  query: z.string().min(1)
    .describe('Search term in any language, e.g. "Milch", "pâtes", "Bier". At least 1 character.'),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']))
    .optional()
    .describe('Restrict search to specific chains. Omit to search all configured chains in parallel.'),
  storeIds: z.array(z.string())
    .optional()
    .describe('Filter results to products available in these store IDs (chain-specific internal IDs).'),
  filters: z.object({
    tags: z.array(z.enum(TAG_VALUES))
      .optional()
      .describe('Product tags to filter by, e.g. ["organic", "vegan"]. All tags must match.'),
    maxPrice: z.number().positive()
      .optional()
      .describe('Maximum product price in CHF (inclusive), e.g. 3.5.'),
    sizeRange: z.object({
      minMl: z.number().nonnegative().optional().describe('Minimum size in millilitres (ml), e.g. 500.'),
      maxMl: z.number().nonnegative().optional().describe('Maximum size in millilitres (ml), e.g. 1500.'),
    }).optional().describe('Size range filter in millilitres; useful for beverages and liquids.'),
  }).optional().describe('Optional product filters applied after search.'),
  limit: z.number().int().positive().max(50)
    .optional()
    .describe('Maximum number of results per chain (1–50). Defaults to chain-specific limit.'),
  offset: z.number().int().nonnegative().max(500)
    .optional()
    .describe('Skip the first N results per chain. Use with `limit` to paginate. Default 0.'),
}).describe('Search for products across configured Swiss grocery chains by keyword, with optional price, size, and tag filters. Returns results grouped by chain.');

export type SearchProductsInput = z.infer<typeof searchProductsSchema>;

export interface SearchProductsOutput {
  byChain: Partial<Record<Chain, NormalizedProduct[]>>;
  errors?: Array<{ chain: Chain; code: string; reason?: string }>;
}

export async function searchProductsHandler(
  registry: AdapterRegistry,
  input: SearchProductsInput,
): Promise<SearchProductsOutput> {
  const adapters = registry.withCapability('productSearch', input.chains);
  const errors: SearchProductsOutput['errors'] = [];
  const byChain: SearchProductsOutput['byChain'] = {};

  await Promise.all(
    adapters.map(async (a) => {
      const r = await a.searchProducts({
        query: input.query,
        storeIds: input.storeIds,
        tags: input.filters?.tags,
        maxPrice: input.filters?.maxPrice,
        sizeRange: input.filters?.sizeRange,
        limit: input.limit,
        offset: input.offset,
      });
      if (r.ok) {
        byChain[a.chain] = r.data;
      } else {
        errors.push({ chain: a.chain, code: r.error.code, reason: 'reason' in r.error ? r.error.reason : undefined });
      }
    }),
  );

  return { byChain, errors: errors.length ? errors : undefined };
}
