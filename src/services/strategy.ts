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
  const chains: Chain[] = ['migros', 'coop', 'aldi', 'denner', 'lidl'];

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
    let bestChain: Chain | null = null;
    let bestPrice = Infinity;
    let bestProduct: NormalizedProduct | null = null;

    for (const [chain, product] of Object.entries(offers) as [Chain, NormalizedProduct | null | undefined][]) {
      if (!product) continue;
      const price = product.price.current;
      if (price < bestPrice) {
        bestPrice = price;
        bestChain = chain;
        bestProduct = product;
      }
    }

    if (!bestChain || !bestProduct) {
      unmatched.push(item);
      continue;
    }

    const qty = item.quantity ?? 1;
    const line = { requested: item, matched: bestProduct, lineTotal: bestPrice * qty };
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
