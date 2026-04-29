import { buildRegistry } from '../src/index.js';
import { getPromotionsHandler } from '../src/tools/get_promotions.js';

const r = buildRegistry();
for (const chain of ['migros', 'coop', 'aldi', 'denner', 'lidl'] as const) {
  console.log(`\n=== ${chain} ===`);
  const out = await getPromotionsHandler(r, { chains: [chain] });
  const empty = out.filter((p) => !p.productName || p.productName.trim() === '').length;
  console.log(`total: ${out.length}, empty productName: ${empty}`);
  for (const p of out.slice(0, 3)) console.log(`  - "${p.productName}" CHF ${p.price?.current ?? '?'}`);
}
