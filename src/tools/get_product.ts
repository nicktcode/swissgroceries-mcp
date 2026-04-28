import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedProduct } from '../adapters/types.js';

export const getProductSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']),
  id: z.string().min(1),
});

export type GetProductInput = z.infer<typeof getProductSchema>;

export async function getProductHandler(
  registry: AdapterRegistry,
  input: GetProductInput,
): Promise<NormalizedProduct | null> {
  const adapter = registry.get(input.chain);
  if (!adapter) throw new Error(`No adapter registered for ${input.chain}`);
  const r = await adapter.getProduct(input.id);
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
}
