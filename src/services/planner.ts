import type {
  Chain, NormalizedProduct, NormalizedStore, StoreAdapter, GeoPoint,
} from '../adapters/types.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import { matchProduct, type ShoppingItem } from './matcher.js';
import { solve, type Strategy, type Plan as StrategyPlan, type Matrix } from './strategy.js';
import { haversineKm } from '../util/haversine.js';

export interface PlanInput {
  items: ShoppingItem[];
  near: GeoPoint;
  chains?: Chain[];
  strategy: Strategy;
  splitPenaltyChf?: number;
  radiusKm?: number;
}

export interface ChainError {
  chain: Chain;
  code: string;
  reason?: string;
}

export interface PlanWithMeta extends StrategyPlan {
  unavailableChains?: ChainError[];
}

export interface PlanResult {
  primary: PlanWithMeta;
  alternatives: PlanWithMeta[];
}

function keyOf(item: ShoppingItem): string {
  return item.preferredProductId
    ? `${item.preferredProductId.chain}:${item.preferredProductId.id}`
    : item.query;
}

export async function plan(registry: AdapterRegistry, input: PlanInput): Promise<PlanResult> {
  const adapters = registry.list(input.chains).filter((a) => a.capabilities.productSearch);
  const radius = input.radiusKm ?? 5;
  const splitPenalty = input.splitPenaltyChf ?? 2.0;
  const errors: ChainError[] = [];

  // 1. Fan out store search per chain
  const storeResults = await Promise.all(
    adapters.map(async (a) => ({
      adapter: a,
      result: await a.searchStores({ near: input.near, radiusKm: radius }),
    })),
  );

  const storeByChain: Partial<Record<Chain, NormalizedStore>> = {};
  for (const { adapter, result } of storeResults) {
    if (!result.ok) {
      errors.push({ chain: adapter.chain, code: result.error.code, reason: 'reason' in result.error ? result.error.reason : undefined });
      continue;
    }
    if (result.data.length === 0) continue;
    const sorted = [...result.data].sort((a, b) => haversineKm(input.near, a.location) - haversineKm(input.near, b.location));
    storeByChain[adapter.chain] = sorted[0];
  }

  // 2. Fan out product search per (item × chain)
  const matrix: Matrix = {};
  for (const item of input.items) matrix[keyOf(item)] = {};

  await Promise.all(
    adapters.flatMap((adapter) =>
      input.items.map(async (item) => {
        if (storeByChain[adapter.chain] === undefined && adapter.capabilities.storeSearch) {
          // No store found for this chain. Still attempt product search so that
          // a failing adapter registers in errors; on success, skip (no local store).
          const probe = await adapter.searchProducts({ query: item.query, limit: 1 });
          if (!probe.ok) {
            if (!errors.some((e) => e.chain === adapter.chain)) {
              errors.push({ chain: adapter.chain, code: probe.error.code, reason: 'reason' in probe.error ? probe.error.reason : undefined });
            }
          }
          matrix[keyOf(item)][adapter.chain] = null;
          return;
        }
        const r = await adapter.searchProducts({
          query: item.query,
          tags: item.filters?.tags,
          maxPrice: item.filters?.maxPrice,
          sizeRange: item.filters?.sizeRange,
          limit: 20,
        });
        if (!r.ok) {
          if (!errors.some((e) => e.chain === adapter.chain)) {
            errors.push({ chain: adapter.chain, code: r.error.code, reason: 'reason' in r.error ? r.error.reason : undefined });
          }
          matrix[keyOf(item)][adapter.chain] = null;
          return;
        }
        matrix[keyOf(item)][adapter.chain] = matchProduct(item, r.data);
      }),
    ),
  );

  const completedStoreByChain = Object.fromEntries(
    Object.entries(storeByChain).filter(([_, v]) => v !== undefined),
  ) as Record<Chain, NormalizedStore>;

  const primaryPlan = solve(input.strategy, input.items, matrix, {
    splitPenaltyChf: splitPenalty,
    storeByChain: completedStoreByChain,
  });

  // Build alternatives
  const altStrategies: Strategy[] = [];
  if (input.strategy !== 'single_store') altStrategies.push('single_store');
  if (input.strategy !== 'split_cart') altStrategies.push('split_cart');
  if (input.strategy !== 'absolute_cheapest') altStrategies.push('absolute_cheapest');

  const alternatives: PlanWithMeta[] = altStrategies
    .map((s) => solve(s, input.items, matrix, {
      splitPenaltyChf: splitPenalty,
      storeByChain: completedStoreByChain,
    }))
    .filter((p) => p.stops.length > 0)
    .slice(0, 2);

  return {
    primary: { ...primaryPlan, unavailableChains: errors.length ? errors : undefined },
    alternatives,
  };
}
