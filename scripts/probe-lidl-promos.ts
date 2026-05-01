import { buildRegistry } from '../src/index.js';
import { getPromotionsHandler } from '../src/tools/get_promotions.js';

const r = buildRegistry();
const promos = await getPromotionsHandler(r, { chains: ['lidl'] });
console.log(`Lidl promotions this week: ${promos.length}\n`);

for (const p of promos.slice(0, 30)) {
  const price = p.price ? `CHF ${p.price.current.toFixed(2)}${p.price.regular ? ` (was ${p.price.regular.toFixed(2)})` : ''}` : 'price n/a';
  const validity = p.validUntil ? ` until ${p.validUntil.slice(0, 10)}` : '';
  console.log(`- ${p.productName.slice(0, 60).padEnd(60)} ${price}${validity}`);
}
if (promos.length > 30) console.log(`\n... and ${promos.length - 30} more`);
