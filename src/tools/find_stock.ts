import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StockResult } from '../adapters/types.js';
import { geocode } from '../services/geocoding.js';
import { ToolError } from './errors.js';

export const findStockSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl', 'farmy', 'volgshop', 'ottos'])
    .describe('The chain to query for stock. Only chains with perStoreStock capability are supported.'),
  productId: z.string().min(1)
    .describe('Chain-specific product ID to check stock for. Obtain via search_products or get_product.'),
  near: z.union([
    z.object({
      lat: z.number().describe('Latitude in decimal degrees (WGS 84), e.g. 47.3769'),
      lng: z.number().describe('Longitude in decimal degrees (WGS 84), e.g. 8.5417'),
    }).describe('Coordinates of the search center'),
    z.object({
      zip: z.string().describe('Swiss postal code (PLZ / NPA), e.g. "8001"'),
    }).describe('Swiss postal code (PLZ), e.g. "8001"'),
    z.object({
      address: z.string().describe('Free-text address, e.g. "Bahnhofstrasse 1, Zürich" — geocoded via OpenStreetMap Nominatim'),
    }).describe('Free-text address — geocoded via Nominatim; prefer zip or lat/lng for speed'),
  ]).optional()
    .describe('Optional location to filter nearby stores. Pass coordinates, a Swiss ZIP, or a free-text address. If omitted, all stores may be queried.'),
  storeId: z.string()
    .optional()
    .describe('Query a single specific store by its chain-specific store ID. Takes precedence over `near`.'),
}).describe('Check which stores of a given chain have a specific product in stock. Useful for "is this item available near me?" queries. Not all chains support per-store stock; check capabilities first.');

export type FindStockInput = z.infer<typeof findStockSchema>;

export async function findStockHandler(
  registry: AdapterRegistry,
  input: FindStockInput,
): Promise<StockResult[]> {
  const adapter = registry.get(input.chain);
  if (!adapter) {
    throw new ToolError(
      'adapter_not_registered',
      `No adapter registered for chain "${input.chain}"`,
      'Ensure the chain is enabled in the server configuration. For Denner, set the DENNER_JWT env var.',
    );
  }
  if (!adapter.findStoresWithStock) {
    throw new ToolError(
      'capability_unsupported',
      `Adapter "${input.chain}" does not support per-store stock queries`,
      'Use search_products to find which chains carry this product, then try a chain that supports stock queries.',
    );
  }

  // Resolve {zip} / {address} / {lat,lng} to coordinates via the same
  // geocode() helper find_stores uses. Skip when no `near` was passed.
  let coords: { lat: number; lng: number } | undefined;
  if (input.near) {
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
        (err as any).code,
        'reason' in err ? (err as any).reason : (err as any).code,
        'Pass a Swiss ZIP code or { lat, lng } coordinates instead of a free-text address.',
      );
    }
    coords = { lat: geo.data.lat, lng: geo.data.lng };
  }

  const r = await adapter.findStoresWithStock(input.productId, coords);
  if (!r.ok) {
    throw new ToolError(
      r.error.code,
      `Stock query failed for ${input.chain}/${input.productId}: ${r.error.code}`,
      'Try again later or use search_products as a fallback.',
    );
  }
  return r.data;
}
