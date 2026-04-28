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

// Curated synonym groups for common Swiss grocery queries.
// When a single-word query matches a key, score against any of the synonyms.
// Lowercase, normalized form. Cross-language (de/fr/it/en) where common.
const QUERY_SYNONYMS: Record<string, string[]> = {
  pasta: ['pasta', 'spaghetti', 'penne', 'fusilli', 'hornli', 'hoernli', 'teigwaren', 'nudeln', 'fettuccine', 'tagliatelle', 'ravioli', 'gnocchi', 'farfalle', 'maccheroni', 'rigatoni', 'lasagne'],
  spaghetti: ['spaghetti'],
  milch: ['milch', 'vollmilch', 'milchdrink', 'lait'],
  kaese: ['kaese', 'fromage', 'cheese'],
  brot: ['brot', 'baguette', 'brotchen', 'brot'],
  eier: ['eier', 'oeuf', 'oeufs', 'eggs'],
  fleisch: ['fleisch', 'rind', 'rindfleisch', 'schwein', 'schweinefleisch', 'poulet', 'huhn', 'huhnchen', 'kalb', 'lamm', 'viande'],
  poulet: ['poulet', 'huhn', 'huhnchen', 'chicken', 'pollo'],
  butter: ['butter', 'beurre'],
  mehl: ['mehl', 'flour', 'farine'],
  zucker: ['zucker', 'sugar', 'sucre'],
  reis: ['reis', 'rice', 'riz'],
  obst: ['obst', 'frucht', 'fruchte', 'fruit', 'frutta'],
  gemuese: ['gemuese', 'legumes', 'verdura', 'vegetables'],
  fisch: ['fisch', 'lachs', 'thunfisch', 'fish', 'poisson'],
  mandelmilch: ['mandelmilch', 'mandeldrink', 'almond'],
  hafermilch: ['hafermilch', 'haferdrink', 'oat'],
  sojamilch: ['sojamilch', 'sojadrink', 'soya'],
  quark: ['quark', 'magerquark'],
  joghurt: ['joghurt', 'yogurt', 'jogurt'],
  banane: ['banane', 'bananen'],
  bananen: ['banane', 'bananen'],
  apfel: ['apfel', 'apfeln', 'apfeli', 'apple'],
  aepfel: ['apfel', 'apfeln', 'apfeli', 'apple'],
  himbeeren: ['himbeeren', 'himbeere', 'raspberry'],
  erdbeeren: ['erdbeeren', 'erdbeere', 'strawberry'],
  haferflocken: ['haferflocken', 'haferflocke', 'oats'],
};

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

function expandQuery(queryTokens: string[]): string[] {
  // Only expand single-word queries. Multi-word queries keep their tokens.
  if (queryTokens.length === 1) {
    const key = queryTokens[0];
    return QUERY_SYNONYMS[key] ?? [key];
  }
  return queryTokens;
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

const NEG_KEYWORDS = /(pflegebad|crème|creme|lotion|shampoo|dusche|seife|haar(?:\s|$)|kosmetik|drogerie|\bdeo\b|\bbad\s)/i;

function scoreCandidate(p: NormalizedProduct, item: ShoppingItem): number {
  const queryTokens = [...tokens(item.query)];
  if (queryTokens.length === 0) return 0;

  // Brand-prefix strip (existing logic, keep it)
  let nameForScoring = p.name;
  if (p.brand) {
    const brandLower = p.brand.toLowerCase();
    const nameLower = p.name.toLowerCase();
    if (nameLower.startsWith(brandLower)) {
      nameForScoring = p.name.slice(p.brand.length).replace(/^[\s,.-]+/, '');
    }
  }

  const nameTokensArr = [...tokens(nameForScoring)];
  if (nameTokensArr.length === 0) return 0;

  const expanded = expandQuery(queryTokens);
  const isSingleWordQuery = queryTokens.length === 1 && expanded.length > 1;

  function bestForToken(token: string): number {
    let best = 0;
    for (let i = 0; i < nameTokensArr.length; i++) {
      const nt = nameTokensArr[i];
      let strength = 0;
      if (nt === token) {
        strength = 1.0;
      } else if (token.length >= 4 && nt.includes(token)) {
        if (nt.endsWith(token)) {
          strength = 0.9;       // German head-noun: "voll-MILCH"
        } else if (nt.startsWith(token)) {
          strength = 0.4;       // German modifier: "APFEL-schorle"
        } else {
          strength = 0.5;       // middle substring
        }
      }
      if (strength > 0) {
        const posWeight =
          i === 0 ? 1.0 :
          i === 1 ? 0.55 :
          i === 2 ? 0.4 :
          0.3;
        const c = strength * posWeight;
        if (c > best) best = c;
      }
    }
    return best;
  }

  let avg: number;
  if (isSingleWordQuery) {
    // Synonym mode: take the best matching synonym score
    let bestSyn = 0;
    for (const syn of expanded) {
      const s = bestForToken(syn);
      if (s > bestSyn) bestSyn = s;
    }
    avg = bestSyn;
  } else {
    // Multi-word mode: average across query tokens
    let total = 0;
    for (const qt of queryTokens) total += bestForToken(qt);
    avg = total / queryTokens.length;
  }

  // Name-length penalty (existing)
  if (nameTokensArr.length > 5) avg *= 0.7;

  // Negative-keyword penalty (existing)
  if (NEG_KEYWORDS.test(p.name)) avg *= 0.2;

  // Category match bonus — also consider synonyms
  if (p.category && p.category.length > 0) {
    const catText = normalize(p.category.join(' '));
    const catCheckTokens = isSingleWordQuery ? expanded : queryTokens;
    for (const qt of catCheckTokens) {
      if (qt.length >= 4 && catText.includes(qt)) {
        avg *= 1.5;
        break;
      }
    }
  }

  return avg;
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

  // Only allow items within 35% of the top score to compete on price.
  // This prevents a weakly-matched cheap item from beating a strongly-matched one.
  const topScore = scored[0].score;
  const scoreFloor = topScore * 0.35;
  const topK = scored.slice(0, 3).filter((s) => s.score >= scoreFloor);
  const priceOf = (p: NormalizedProduct) => p.unitPrice?.value ?? p.price.current;

  topK.sort((a, b) => priceOf(a.product) - priceOf(b.product));
  return topK[0].product;
}
