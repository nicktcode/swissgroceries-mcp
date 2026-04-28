import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import { plan, type PlanResult } from '../services/planner.js';
import { geocode } from '../services/geocoding.js';

const TAG_VALUES = ['organic','budget','premium','fairtrade','lactose-free','gluten-free','vegan','vegetarian','sugar-free','regional','swiss-made'] as const;

const itemSchema = z.object({
  query: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  preferredChain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']).optional(),
  preferredProductId: z.object({
    chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']),
    id: z.string(),
  }).optional(),
  filters: z.object({
    tags: z.array(z.enum(TAG_VALUES)).optional(),
    maxPrice: z.number().positive().optional(),
    sizeRange: z.object({
      minMl: z.number().nonnegative().optional(),
      maxMl: z.number().nonnegative().optional(),
    }).optional(),
  }).optional(),
});

export const planShoppingSchema = z.object({
  items: z.array(itemSchema).min(1),
  near: z.union([
    z.object({ lat: z.number(), lng: z.number() }),
    z.object({ zip: z.string() }),
    z.object({ address: z.string() }),
  ]),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])).optional(),
  strategy: z.enum(['single_store', 'split_cart', 'absolute_cheapest']),
  splitPenaltyChf: z.number().nonnegative().optional(),
  radiusKm: z.number().positive().max(50).optional(),
});

export type PlanShoppingInput = z.infer<typeof planShoppingSchema>;

export async function planShoppingHandler(
  registry: AdapterRegistry,
  input: PlanShoppingInput,
): Promise<PlanResult> {
  const geo = geocode(input.near as any);
  if (!geo.ok) throw new Error(geo.error.code);

  return plan(registry, {
    items: input.items,
    near: { lat: geo.data.lat, lng: geo.data.lng, city: geo.data.city },
    chains: input.chains,
    strategy: input.strategy,
    splitPenaltyChf: input.splitPenaltyChf,
    radiusKm: input.radiusKm,
  });
}
