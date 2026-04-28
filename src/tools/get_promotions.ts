import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedPromotion } from '../adapters/types.js';

export const getPromotionsSchema = z.object({
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])).optional(),
  query: z.string().optional(),
  endingWithinDays: z.number().int().positive().max(60).optional(),
  storeIds: z.array(z.string()).optional(),
});

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
