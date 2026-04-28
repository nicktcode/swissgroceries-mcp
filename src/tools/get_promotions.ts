import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedPromotion } from '../adapters/types.js';

export const getPromotionsSchema = z.object({
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']))
    .optional()
    .describe('Limit to specific chains. Omit to fetch promotions from all configured chains.'),
  query: z.string()
    .optional()
    .describe('Optional keyword to filter promotions by product name, e.g. "Käse", "wine".'),
  endingWithinDays: z.number().int().positive().max(60)
    .optional()
    .describe('Only return promotions ending within this many days (1–60). Useful for "ending soon" queries.'),
  storeIds: z.array(z.string())
    .optional()
    .describe('Restrict to promotions valid at these store IDs (chain-specific). Obtain store IDs from find_stores.'),
}).describe('List current promotional deals across Swiss grocery chains. Supports keyword search and filtering by chain, store, or expiry window. Use for "what is on sale?" or "any deals on pasta this week?" queries.');

export type GetPromotionsInput = z.infer<typeof getPromotionsSchema>;

export async function getPromotionsHandler(
  registry: AdapterRegistry,
  input: GetPromotionsInput,
): Promise<NormalizedPromotion[]> {
  const adapters = registry.withCapability('promotions', input.chains);
  const lists = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.getPromotions({
        query: input.query,
        endingWithinDays: input.endingWithinDays,
        storeIds: input.storeIds,
      });
      return r.ok ? r.data : [];
    }),
  );
  return lists.flat();
}
