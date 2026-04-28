import type { Chain, NormalizedProduct, NormalizedStore } from '../adapters/types.js';
import type { ShoppingItem } from './matcher.js';

export type Strategy = 'single_store' | 'split_cart' | 'absolute_cheapest';

export type Matrix = Record<string, Partial<Record<Chain, NormalizedProduct | null>>>;

export interface PlanStop {
  store: { chain: Chain; id?: string; name?: string };
  items: Array<{
    requested: ShoppingItem;
    matched: NormalizedProduct;
    lineTotal: number;
  }>;
  subtotalChf: number;
}

export interface Plan {
  strategy: Strategy;
  totalChf: number;
  stops: PlanStop[];
  unmatchedItems: ShoppingItem[];
}

export interface SolveOpts {
  splitPenaltyChf: number;
  storeByChain?: Record<Chain, NormalizedStore | undefined>;
}

function keyOf(item: ShoppingItem): string {
  return item.preferredProductId
    ? `${item.preferredProductId.chain}:${item.preferredProductId.id}`
    : item.query;
}

export function solve(
  strategy: Strategy,
  items: ShoppingItem[],
  matrix: Matrix,
  opts: SolveOpts,
): Plan {
  const penalty = strategy === 'absolute_cheapest' ? 0 : opts.splitPenaltyChf;

  if (strategy === 'single_store') {
    return solveSingleStore(items, matrix, opts);
  }
  return solveSplit(strategy, items, matrix, { ...opts, splitPenaltyChf: penalty });
}

function solveSingleStore(items: ShoppingItem[], matrix: Matrix, opts: SolveOpts): Plan {
  const chainSet = new Set<Chain>();
  for (const offers of Object.values(matrix)) {
    for (const chain of Object.keys(offers ?? {}) as Chain[]) {
      chainSet.add(chain);
    }
  }
  const chains = [...chainSet];

  let best: { chain: Chain; total: number; coverage: number; lines: PlanStop['items'] } | null = null;

  for (const chain of chains) {
    let total = 0;
    let coverage = 0;
    const lines: PlanStop['items'] = [];

    for (const item of items) {
      const product = matrix[keyOf(item)]?.[chain];
      if (product) {
        const qty = item.quantity ?? 1;
        const line = product.price.current * qty;
        total += line;
        coverage++;
        lines.push({ requested: item, matched: product, lineTotal: line });
      }
    }

    if (
      best === null ||
      coverage > best.coverage ||
      (coverage === best.coverage && total < best.total)
    ) {
      best = { chain, total, coverage, lines };
    }
  }

  if (!best || best.coverage === 0) {
    return { strategy: 'single_store', totalChf: 0, stops: [], unmatchedItems: items };
  }

  const unmatched = items.filter(
    (item) => !best!.lines.find((l) => keyOf(l.requested) === keyOf(item)),
  );

  return {
    strategy: 'single_store',
    totalChf: best.total,
    stops: [
      {
        store: opts.storeByChain?.[best.chain]
          ? { chain: best.chain, id: opts.storeByChain[best.chain]!.id, name: opts.storeByChain[best.chain]!.name }
          : { chain: best.chain },
        items: best.lines,
        subtotalChf: best.total,
      },
    ],
    unmatchedItems: unmatched,
  };
}

function solveSplit(
  strategy: 'split_cart' | 'absolute_cheapest',
  items: ShoppingItem[],
  matrix: Matrix,
  opts: SolveOpts,
): Plan {
  const perChain: Map<Chain, PlanStop['items']> = new Map();
  const unmatched: ShoppingItem[] = [];

  for (const item of items) {
    const offers = matrix[keyOf(item)] ?? {};

    // Cross-chain comparison: prefer the cheapest UNIT price (CHF/kg, CHF/l,
    // CHF/piece) so a 0.5L bottle isn't unfairly preferred over a 6×1.5L pack.
    // Restrict to products that share a `unitPrice.per` unit. Fall back to
    // absolute price when no candidate has a unit price (or units are mixed).
    const candidates: Array<[Chain, NormalizedProduct]> = [];
    for (const [chain, product] of Object.entries(offers) as [Chain, NormalizedProduct | null | undefined][]) {
      if (product) candidates.push([chain, product]);
    }
    if (candidates.length === 0) {
      unmatched.push(item);
      continue;
    }

    const withUnit = candidates.filter(([, p]) => p.unitPrice !== undefined);
    let pool = candidates;
    if (withUnit.length > 0) {
      // Pick the dominant `per` unit (most candidates share it) to compare like-for-like.
      const counts: Record<string, number> = {};
      for (const [, p] of withUnit) counts[p.unitPrice!.per] = (counts[p.unitPrice!.per] ?? 0) + 1;
      const dominantPer = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      pool = withUnit.filter(([, p]) => p.unitPrice!.per === dominantPer);
    }

    pool.sort((a, b) => {
      const ap = a[1].unitPrice?.value ?? a[1].price.current;
      const bp = b[1].unitPrice?.value ?? b[1].price.current;
      return ap - bp;
    });

    const [bestChain, bestProduct] = pool[0];
    const qty = item.quantity ?? 1;
    const line = { requested: item, matched: bestProduct, lineTotal: bestProduct.price.current * qty };
    if (!perChain.has(bestChain)) perChain.set(bestChain, []);
    perChain.get(bestChain)!.push(line);
  }

  const stops: PlanStop[] = [];
  let total = 0;
  for (const [chain, lines] of perChain.entries()) {
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    total += subtotal;
    stops.push({
      store: opts.storeByChain?.[chain]
        ? { chain, id: opts.storeByChain[chain]!.id, name: opts.storeByChain[chain]!.name }
        : { chain },
      items: lines,
      subtotalChf: subtotal,
    });
  }

  if (stops.length > 1) total += opts.splitPenaltyChf * (stops.length - 1);

  return { strategy, totalChf: total, stops, unmatchedItems: unmatched };
}
