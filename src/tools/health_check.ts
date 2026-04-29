import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { Chain } from '../adapters/types.js';

export const healthCheckSchema = z.object({
  chains: z.array(z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl']))
    .optional()
    .describe('Chains to probe. Default: all configured.'),
  timeoutMs: z.number().int().positive().max(30000).optional()
    .describe('Per-chain timeout in milliseconds. Default 5000.'),
}).describe('Probe each registered chain adapter with a trivial query and report which are healthy. Useful for diagnosing why a particular chain is missing from search/plan results.');

export type HealthCheckInput = z.infer<typeof healthCheckSchema>;

export interface HealthCheckResult {
  chain: Chain;
  registered: boolean;
  ok: boolean;
  latencyMs?: number;
  error?: { code: string; reason?: string };
  capabilities?: Record<string, boolean>;
}

const TRIVIAL_QUERY = 'milch';

export async function healthCheckHandler(
  registry: AdapterRegistry,
  input: HealthCheckInput,
): Promise<{ chains: HealthCheckResult[]; summary: { healthy: number; unhealthy: number; unregistered: number } }> {
  const all: Chain[] = ['migros', 'coop', 'aldi', 'denner', 'lidl'];
  const requested = input.chains ?? all;
  const timeout = input.timeoutMs ?? 5000;

  const results = await Promise.all(requested.map(async (chain): Promise<HealthCheckResult> => {
    const adapter = registry.get(chain);
    if (!adapter) return { chain, registered: false, ok: false };
    const start = Date.now();
    try {
      const r = await Promise.race([
        adapter.searchProducts({ query: TRIVIAL_QUERY, limit: 1 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
      ]);
      const latencyMs = Date.now() - start;
      if (r.ok) {
        return {
          chain, registered: true, ok: true, latencyMs,
          capabilities: { ...adapter.capabilities },
        };
      }
      return {
        chain, registered: true, ok: false, latencyMs,
        error: { code: r.error.code, reason: 'reason' in r.error ? r.error.reason : undefined },
        capabilities: { ...adapter.capabilities },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        chain, registered: true, ok: false,
        error: { code: msg === 'timeout' ? 'timeout' : 'unavailable', reason: msg },
        capabilities: { ...adapter.capabilities },
      };
    }
  }));

  const summary = {
    healthy: results.filter((r) => r.ok).length,
    unhealthy: results.filter((r) => r.registered && !r.ok).length,
    unregistered: results.filter((r) => !r.registered).length,
  };

  return { chains: results, summary };
}
