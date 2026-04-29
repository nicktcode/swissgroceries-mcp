import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StockResult } from '../adapters/types.js';
import { ToolError } from './errors.js';

export const findStockSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl', 'farmy', 'volgshop', 'ottos'])
    .describe('The chain to query for stock. Only chains with perStoreStock capability are supported.'),
  productId: z.string().min(1)
    .describe('Chain-specific product ID to check stock for. Obtain via search_products or get_product.'),
  near: z.object({
    lat: z.number().describe('Latitude in decimal degrees (WGS 84).'),
    lng: z.number().describe('Longitude in decimal degrees (WGS 84).'),
  }).optional()
    .describe('Optional coordinates to filter nearby stores. If omitted, all stores may be queried.'),
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
  const r = await adapter.findStoresWithStock(input.productId, input.near);
  if (!r.ok) {
    throw new ToolError(
      r.error.code,
      `Stock query failed for ${input.chain}/${input.productId}: ${r.error.code}`,
      'Try again later or use search_products as a fallback.',
    );
  }
  return r.data;
}
