import type {
  Chain, NormalizedProduct, NormalizedStore, GeoPoint,
} from '../adapters/types.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import { matchProduct, isCanonical, type ShoppingItem } from './matcher.js';
import { solve, type Strategy, type Plan as StrategyPlan, type Matrix } from './strategy.js';
import { haversineKm } from '../util/haversine.js';
import type { SwissLanguage } from './language.js';

export interface PlanInput {
  items: ShoppingItem[];
  near: GeoPoint & { city?: string };
  chains?: Chain[];
  strategy: Strategy;
  splitPenaltyChf?: number;
  radiusKm?: number;
  /** Catalogue language to query each chain in. Defaults per-adapter (usually German). */
  language?: SwissLanguage;
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

function nearestStore(near: GeoPoint, stores: NormalizedStore[]): NormalizedStore | undefined {
  return [...stores].sort(
    (a, b) => haversineKm(near, a.location) - haversineKm(near, b.location),
  )[0];
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
      result: await a.searchStores({ near: input.near, radiusKm: radius, cityHint: input.near.city }),
    })),
  );

  const storeByChain: Partial<Record<Chain, NormalizedStore>> = {};
  for (const { adapter, result } of storeResults) {
    if (!result.ok) {
      errors.push({ chain: adapter.chain, code: result.error.code, reason: 'reason' in result.error ? result.error.reason : undefined });
      continue;
    }
    if (result.data.length === 0) continue;
    storeByChain[adapter.chain] = nearestStore(input.near, result.data);
  }

  // 1b. Radius fallback: a geolocatable chain with no branch inside `radius`
  // shouldn't be dropped just because its nearest store sits slightly outside a
  // tight search radius. Retry those chains once with an expanded radius before
  // deciding they have no local presence.
  const fallbackRadius = Math.max(radius * 4, 25);
  if (fallbackRadius > radius) {
    await Promise.all(
      storeResults.map(async ({ adapter, result }) => {
        if (storeByChain[adapter.chain] !== undefined) return; // already have a nearby store
        if (!result.ok) return;                                // real error already recorded above
        if (!adapter.capabilities.storeSearch) return;
        const retry = await adapter.searchStores({ near: input.near, radiusKm: fallbackRadius, cityHint: input.near.city });
        if (retry.ok && retry.data.length > 0) {
          storeByChain[adapter.chain] = nearestStore(input.near, retry.data);
        }
      }),
    );
  }

  // 2. Fan out product search per (item × chain)
  const matrix: Matrix = {};
  for (const item of input.items) matrix[keyOf(item)] = {};

  await Promise.all(
    adapters.flatMap((adapter) =>
      input.items.map(async (item) => {
        // Run the product search for every chain (even those without a nearby
        // store) so adapter errors are always registered here through a single
        // path. Reachability is enforced afterwards, not by short-circuiting.
        const r = await adapter.searchProducts({
          query: item.query,
          tags: item.filters?.tags,
          maxPrice: item.filters?.maxPrice,
          sizeRange: item.filters?.sizeRange,
          limit: 20,
          language: input.language,
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

  // Reachability guard: a geolocatable chain (storeSearch) with no store found
  // even after the radius expansion above must not be proposed as a physical
  // stop — otherwise a cheaper-but-unreachable branch could win single_store /
  // split_cart and hide a store the user can actually get to. Null out its
  // matches. Online-only chains (no storeSearch) are exempt: they're orderable
  // without a nearby store, so their products stay in the plan best-effort.
  for (const adapter of adapters) {
    if (!adapter.capabilities.storeSearch) continue;
    if (storeByChain[adapter.chain] !== undefined) continue;
    for (const item of input.items) {
      matrix[keyOf(item)][adapter.chain] = null;
    }
  }

  // Canonicality filter: for each item, if at least one chain has a product
  // whose category contains a query token/synonym, drop all non-canonical chains
  // to null for that item. This prevents tangential products (e.g. Apfelschorle
  // for "apfel") from winning cross-chain comparisons against real apples.
  for (const item of input.items) {
    const key = keyOf(item);
    const offers = matrix[key];
    if (!offers) continue;

    const canonical: typeof offers = {};
    let hasCanonical = false;
    for (const [chain, product] of Object.entries(offers) as [Chain, NormalizedProduct | null | undefined][]) {
      if (product && isCanonical(product, item)) {
        canonical[chain] = product;
        hasCanonical = true;
      }
    }

    if (hasCanonical) {
      // Replace the matrix row with only canonical matches.
      // Tangential chains become null for this item.
      for (const chain of Object.keys(offers) as Chain[]) {
        if (!canonical[chain]) offers[chain] = null;
      }
    }
    // If no chain has a canonical match, leave the row alone (best-effort fallback).
  }

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
