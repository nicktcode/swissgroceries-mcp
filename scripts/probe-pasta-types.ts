import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';
import { matchProduct } from '../src/services/matcher.js';

const r = buildRegistry();

const queries = ['penne', 'spaghetti', 'hörnli', 'tagliatelle', 'fusilli', 'lasagne', 'gnocchi', 'ravioli'];

for (const q of queries) {
  console.log(`\n=== query: "${q}" ===`);
  const out = await searchProductsHandler(r, { query: q, chains: ['migros', 'coop'], limit: 5 });
  for (const [chain, products] of Object.entries(out.byChain)) {
    if (!products?.length) continue;
    const matched = matchProduct({ query: q }, products);
    console.log(`${chain}:`);
    for (const p of products.slice(0, 3)) {
      const mark = matched && p.id === matched.id ? '★' : ' ';
      console.log(`  ${mark} ${p.name.slice(0, 50)} | CHF ${p.price.current}`);
    }
    console.log(`  → matched: ${matched?.name.slice(0, 50) ?? 'NONE'}`);
  }
}
