import type { Chain, NormalizedProduct, NormalizedStore } from '../adapters/types.js';
import { effectiveCost, isMultipack, type ShoppingItem } from './matcher.js';

export type Strategy = 'single_store' | 'split_cart' | 'absolute_cheapest';

export type Matrix = Record<string, Partial<Record<Chain, NormalizedProduct | null>>>;

export interface PlanStop {
  store: { chain: Chain; id?: string; name?: string };
  items: Array<{
    requested: ShoppingItem;
    matched: NormalizedProduct;
    lineTotal: number;
    /** Packs to buy for this line (>1 when a `need` doesn't fit one pack). */
    packs?: number;
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

/** Cheapest-first by unit price, falling back to absolute pack price. */
function byUnitPrice(a: NormalizedProduct, b: NormalizedProduct): number {
  const ap = a.unitPrice?.value ?? a.price.current;
  const bp = b.unitPrice?.value ?? b.price.current;
  return ap - bp;
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
        const cost = effectiveCost(product, item);
        total += cost.chf;
        coverage++;
        lines.push({ requested: item, matched: product, lineTotal: cost.chf, packs: cost.packs });
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

    // Prefer single packs unless the user asked for a multipack via query syntax.
    const userWantsBulk = /\d+\s*[x×]\s*\d|multipack|sixpack|sechserpack/i.test(item.query);
    const preferSingles = (
      list: Array<[Chain, NormalizedProduct]>,
    ): Array<[Chain, NormalizedProduct]> => {
      if (userWantsBulk) return list;
      const singles = list.filter(([, p]) => !isMultipack(p));
      return singles.length > 0 ? singles : list;
    };

    let bestChain: Chain;
    let bestProduct: NormalizedProduct;

    if (item.need) {
      // Need-aware: rank by the true CHF to cover the requested amount (pack
      // price × packs needed), so pack size and rounding — not just CHF/kg —
      // decide the winner. Rank over ALL candidates, deliberately NOT the
      // `dominantPer` pool used by the legacy branch below: that pool is tuned
      // for like-for-like unit-price comparison and can drop the very candidates
      // able to satisfy the need's dimension (a majority of per-piece offers
      // would exclude the per-kg products a kg need requires). `effectiveCost`
      // marks candidates it can size in the need's dimension (`sized`); rank
      // those by real cost, and only when none can be sized fall back to the
      // unit-price order best-effort.
      const costed = preferSingles(candidates).map(([c, p]) => ({ c, p, cost: effectiveCost(p, item) }));
      const sized = costed.filter((x) => x.cost.sized);
      const ranked = sized.length > 0
        ? [...sized].sort((a, b) => a.cost.chf - b.cost.chf)
        : [...costed].sort((a, b) => byUnitPrice(a.p, b.p));
      bestChain = ranked[0].c;
      bestProduct = ranked[0].p;
    } else {
      // Legacy: compare like-for-like UNIT prices within the dominant `per` unit
      // so a 0.5 L bottle isn't unfairly preferred over a 6×1.5 L pack. Fall back
      // to absolute price when no candidate carries a unit price.
      const withUnit = candidates.filter(([, p]) => p.unitPrice !== undefined);
      let pool = candidates;
      if (withUnit.length > 0) {
        const counts: Record<string, number> = {};
        for (const [, p] of withUnit) counts[p.unitPrice!.per] = (counts[p.unitPrice!.per] ?? 0) + 1;
        const dominantPer = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        pool = withUnit.filter(([, p]) => p.unitPrice!.per === dominantPer);
      }
      pool = preferSingles(pool);
      pool.sort((a, b) => byUnitPrice(a[1], b[1]));
      bestChain = pool[0][0];
      bestProduct = pool[0][1];
    }

    const cost = effectiveCost(bestProduct, item);
    const line = { requested: item, matched: bestProduct, lineTotal: cost.chf, packs: cost.packs };
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
