import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';

const r = buildRegistry();
const out = await searchProductsHandler(r, { query: 'apfelschorle', limit: 5 });
for (const [chain, products] of Object.entries(out.byChain)) {
  console.log(`\n${chain}:`);
  for (const p of products ?? []) {
    const sz = p.size ? `${p.size.value}${p.size.unit}` : 'no-size';
    const up = p.unitPrice ? `${p.unitPrice.value.toFixed(2)}/${p.unitPrice.per}` : 'no-unit-price';
    console.log(`  - ${p.name.slice(0,55).padEnd(55)} | CHF ${p.price.current.toString().padEnd(5)} | ${sz.padEnd(10)} | ${up}`);
  }
}
