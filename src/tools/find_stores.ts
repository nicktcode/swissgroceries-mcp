import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedStore } from '../adapters/types.js';
import { geocode } from '../services/geocoding.js';
import { ToolError } from './errors.js';

export const findStoresSchema = z.object({
  near: z.union([
    z.object({
      lat: z.number().describe('Latitude in decimal degrees (WGS 84), e.g. 47.3769'),
      lng: z.number().describe('Longitude in decimal degrees (WGS 84), e.g. 8.5417'),
    }).describe('Coordinates of the search center'),
    z.object({
      zip: z.string().describe('Swiss postal code (PLZ / NPA), e.g. "8001"'),
    }).describe('Swiss postal code (PLZ), e.g. "8001"'),
    z.object({
      address: z.string().describe('Free-text address string, e.g. "Bahnhofstrasse 1, Zürich" — geocoded via OpenStreetMap Nominatim'),
    }).describe('Free-text address — geocoded via Nominatim; prefer zip or lat/lng for speed'),
  ]).describe('Center of the search radius. Pass either coordinates, a Swiss ZIP, or a free-text address.'),
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']))
    .optional()
    .describe('Limit results to specific chains. Omit to search all configured chains.'),
  radiusKm: z.number().positive().max(50)
    .optional()
    .describe('Search radius in kilometers (1–50). Defaults to 5 km.'),
}).describe('Find grocery stores near a location, filtered by chain and radius. Returns store name, address, location, and hours.');

export type FindStoresInput = z.infer<typeof findStoresSchema>;

export async function findStoresHandler(
  registry: AdapterRegistry,
  input: FindStoresInput,
): Promise<NormalizedStore[]> {
  const geo = await geocode(input.near as any);
  if (!geo.ok) {
    const err = geo.error;
    if (err.code === 'unknown_zip') {
      throw new ToolError(
        'unknown_zip',
        `ZIP "${(err as any).zip}" is not in the lookup table`,
        'Pass { lat, lng } directly or check that the ZIP is a valid Swiss PLZ (e.g. "8001").',
      );
    }
    if (err.code === 'address_not_found') {
      throw new ToolError(
        'address_not_found',
        `Address "${(err as any).query}" could not be geocoded`,
        'Try a more specific address or pass a Swiss ZIP code or { lat, lng } coordinates.',
      );
    }
    if (err.code === 'unavailable') {
      throw new ToolError(
        'unavailable',
        (err as any).reason,
        'The Nominatim geocoding service is temporarily unavailable. Try passing a ZIP or { lat, lng } instead.',
      );
    }
    throw new ToolError(
      err.code,
      'address_unsupported' in err ? (err as any).reason : err.code,
      'Pass a Swiss ZIP code or { lat, lng } coordinates instead of a free-text address.',
    );
  }

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
