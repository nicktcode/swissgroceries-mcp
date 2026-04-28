import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedProduct } from '../adapters/types.js';
import { ToolError } from './errors.js';

export const getProductSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl'])
    .describe('The grocery chain that owns this product ID.'),
  id: z.string().min(1)
    .describe('Chain-specific product identifier, e.g. Migros cumulus ID or Coop product number. Obtain via search_products.'),
}).describe('Fetch full product details (price, size, tags, promotions) for a specific chain + product ID pair. Use after search_products to drill into a result.');

export type GetProductInput = z.infer<typeof getProductSchema>;

export async function getProductHandler(
  registry: AdapterRegistry,
  input: GetProductInput,
): Promise<NormalizedProduct | null> {
  const adapter = registry.get(input.chain);
  if (!adapter) {
    throw new ToolError(
      'adapter_not_registered',
      `No adapter registered for chain "${input.chain}"`,
      'Ensure the chain is enabled in the server configuration. For Denner, set the DENNER_JWT env var.',
    );
  }
  const r = await adapter.getProduct(input.id);
  if (!r.ok) {
    throw new ToolError(
      r.error.code,
      `Product fetch failed for ${input.chain}/${input.id}: ${r.error.code}`,
      r.error.code === 'not_found'
        ? 'The product ID may be invalid or discontinued. Re-run search_products to get a fresh ID.'
        : 'Try again later or use search_products to find an alternative.',
    );
  }
  return r.data;
}
