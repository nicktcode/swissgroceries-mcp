import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';
import { matchProduct } from '../src/services/matcher.js';

const r = buildRegistry();

const cases = [
  'apfel',
  'apfelschorle',
  'trüfrü himbeeren',
  'schorle',
  'shampoo',
  'pflegebad milch',
];

for (const q of cases) {
  console.log(`\n=== query: "${q}" ===`);
  const out = await searchProductsHandler(r, { query: q, limit: 5 });
  for (const [chain, products] of Object.entries(out.byChain)) {
    if (!products?.length) continue;
    const matched = matchProduct({ query: q }, products);
    console.log(`${chain}: ${products.length} returned, matched: ${matched?.name?.slice(0, 70) ?? 'NONE'} ${matched ? `CHF ${matched.price.current}` : ''}`);
  }
}
