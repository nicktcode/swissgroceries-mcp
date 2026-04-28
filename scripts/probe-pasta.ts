import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';

async function probe(query: string) {
  const r = buildRegistry();
  const out = await searchProductsHandler(r, { query, limit: 5 });
  console.log(`\n=== query: "${query}" ===`);
  for (const [chain, products] of Object.entries(out.byChain)) {
    console.log(`\n${chain}: ${(products ?? []).length} results`);
    for (const p of products ?? []) {
      const cat = p.category ? `[${p.category.join(' / ')}]` : '';
      console.log(`  - ${p.name} | CHF ${p.price.current} ${cat}`);
    }
  }
  if (out.errors?.length) console.log('errors:', out.errors);
}

await probe('pasta');
await probe('teigwaren');
await probe('spaghetti');
