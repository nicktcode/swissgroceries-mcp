import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';

const r = buildRegistry();

for (const q of ['himbeeren', 'gefrorene himbeeren', 'tiefkühl himbeeren']) {
  console.log(`\n=== "${q}" ===`);
  const out = await searchProductsHandler(r, { query: q, limit: 10 });
  for (const [chain, products] of Object.entries(out.byChain)) {
    if (!products?.length) continue;
    console.log(`\n${chain}:`);
    for (const p of products) {
      const cat = p.category ? ` [${p.category.join(' / ').slice(0, 50)}]` : '';
      const u = p.unitPrice ? ` (${p.unitPrice.value.toFixed(2)}/${p.unitPrice.per})` : '';
      console.log(`  - ${p.name.slice(0, 70)} | CHF ${p.price.current}${u}${cat}`);
    }
  }
}
