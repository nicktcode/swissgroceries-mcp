import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { Chain, NormalizedStore } from '../adapters/types.js';
import { geocode } from '../services/geocoding.js';

export const findStoresSchema = z.object({
  near: z.union([
    z.object({ lat: z.number(), lng: z.number() }),
    z.object({ zip: z.string() }),
    z.object({ address: z.string() }),
  ]),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])).optional(),
  radiusKm: z.number().positive().max(50).optional(),
});

export type FindStoresInput = z.infer<typeof findStoresSchema>;

export async function findStoresHandler(
  registry: AdapterRegistry,
  input: FindStoresInput,
): Promise<NormalizedStore[]> {
  const geo = geocode(input.near as any);
  if (!geo.ok) throw new Error(geo.error.code);

  const radius = input.radiusKm ?? 5;
  const adapters = registry.withCapability('storeSearch', input.chains);

  const results = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.searchStores({
        near: { lat: geo.data.lat, lng: geo.data.lng },
        radiusKm: radius,
        cityHint: geo.data.city,
      });
      return r.ok ? r.data : [];
    }),
  );
  return results.flat();
}
