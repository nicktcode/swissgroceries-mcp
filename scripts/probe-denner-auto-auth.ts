import { buildRegistry } from '../src/index.js';
import { searchProductsHandler } from '../src/tools/search_products.js';

console.log('DENNER_JWT set?', !!process.env.DENNER_JWT);

const r = buildRegistry();
const out = await searchProductsHandler(r, { query: 'milch', chains: ['denner'], limit: 3 });
console.log('denner products returned:', (out.byChain.denner ?? []).length);
for (const p of out.byChain.denner ?? []) {
  console.log(`  - ${p.name.slice(0, 60)} CHF ${p.price.current}`);
}
if (out.errors?.length) console.log('errors:', out.errors);
