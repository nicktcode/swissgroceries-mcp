import type { Chain, NormalizedProduct, Tag } from '../adapters/types.js';

export interface ShoppingItem {
  query: string;
  quantity?: number;
  preferredChain?: Chain;
  preferredProductId?: { chain: Chain; id: string };
  filters?: {
    tags?: Tag[];
    maxPrice?: number;
    sizeRange?: { minMl?: number; maxMl?: number };
  };
}

const SCORE_THRESHOLD = 0.3;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter(Boolean));
}

function tokenSetRatio(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function passesHardFilters(p: NormalizedProduct, item: ShoppingItem): boolean {
  const f = item.filters;
  if (!f) return true;

  if (f.tags && f.tags.length > 0) {
    for (const t of f.tags) if (!p.tags.includes(t)) return false;
  }
  if (f.maxPrice !== undefined && p.price.current > f.maxPrice) return false;

  if (f.sizeRange && p.size) {
    const ml = sizeToMl(p.size);
    if (ml !== undefined) {
      if (f.sizeRange.minMl !== undefined && ml < f.sizeRange.minMl) return false;
      if (f.sizeRange.maxMl !== undefined && ml > f.sizeRange.maxMl) return false;
    }
  }
  return true;
}

function sizeToMl(size: NormalizedProduct['size']): number | undefined {
  if (!size) return undefined;
  switch (size.unit) {
    case 'ml': return size.value;
    case 'l':  return size.value * 1000;
    case 'g':  return size.value;
    case 'kg': return size.value * 1000;
    case 'piece': return undefined;
  }
}

interface Scored {
  product: NormalizedProduct;
  score: number;
}

function scoreCandidate(p: NormalizedProduct, item: ShoppingItem): number {
  const haystack = [p.name, p.brand ?? '', ...(p.category ?? [])].join(' ');
  const nameSim = tokenSetRatio(item.query, haystack);

  let score = nameSim;

  const nameTokens = tokens(p.name);
  const queryTokens = tokens(item.query);
  let nameHits = 0;
  for (const t of queryTokens) if (nameTokens.has(t)) nameHits++;
  if (queryTokens.size > 0) {
    score += 0.2 * (nameHits / queryTokens.size);
  }

  // Substring bonus for compound-word matches (e.g., "milch" inside "vollmilch")
  const normalizedName = normalize(p.name);
  let substringHits = 0;
  for (const t of queryTokens) {
    if (t.length >= 4 && normalizedName.includes(t) && !nameTokens.has(t)) {
      substringHits++;
    }
  }
  if (queryTokens.size > 0) {
    score += 0.3 * (substringHits / queryTokens.size);
  }

  return score;
}

export function matchProduct(
  item: ShoppingItem,
  candidates: NormalizedProduct[],
): NormalizedProduct | null {
  if (item.preferredProductId) {
    const pinned = candidates.find(
      (c) => c.chain === item.preferredProductId!.chain && c.id === item.preferredProductId!.id,
    );
    return pinned ?? null;
  }

  const filtered = candidates.filter((c) => passesHardFilters(c, item));
  if (filtered.length === 0) return null;

  const scored: Scored[] = filtered
    .map((p) => ({ product: p, score: scoreCandidate(p, item) }))
    .filter((s) => s.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const topK = scored.slice(0, 3);
  const priceOf = (p: NormalizedProduct) => p.unitPrice?.value ?? p.price.current;

  topK.sort((a, b) => priceOf(a.product) - priceOf(b.product));
  return topK[0].product;
}
