import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { Chain, NormalizedProduct } from '../adapters/types.js';

const TAG_VALUES = [
  'organic','budget','premium','fairtrade','lactose-free','gluten-free',
  'vegan','vegetarian','sugar-free','regional','swiss-made',
] as const;

export const searchProductsSchema = z.object({
  query: z.string().min(1),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])).optional(),
  storeIds: z.array(z.string()).optional(),
  filters: z.object({
    tags: z.array(z.enum(TAG_VALUES)).optional(),
    maxPrice: z.number().positive().optional(),
    sizeRange: z.object({
      minMl: z.number().nonnegative().optional(),
      maxMl: z.number().nonnegative().optional(),
    }).optional(),
  }).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

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
