import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StockResult } from '../adapters/types.js';

export const findStockSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']),
  productId: z.string().min(1),
  near: z.object({ lat: z.number(), lng: z.number() }).optional(),
  storeId: z.string().optional(),
});

export type FindStockInput = z.infer<typeof findStockSchema>;

export async function findStockHandler(
  registry: AdapterRegistry,
  input: FindStockInput,
): Promise<StockResult[]> {
  const adapter = registry.get(input.chain);
  if (!adapter) throw new Error(`No adapter for ${input.chain}`);
  if (!adapter.findStoresWithStock) {
    throw new Error(`Adapter ${input.chain} does not support stock queries`);
  }
  const r = await adapter.findStoresWithStock(input.productId, input.near);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
}
