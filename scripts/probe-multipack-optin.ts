import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

const r = buildRegistry();

for (const q of ['apfelschorle', 'apfelschorle 6x']) {
  console.log(`\nquery: "${q}"`);
  const out = await planShoppingHandler(r, {
    items: [{ query: q }],
    near: { zip: '5430' },
    strategy: 'split_cart',
  });
  for (const stop of out.primary.stops) for (const l of stop.items) {
    const u = l.matched.unitPrice ? `[${l.matched.unitPrice.value.toFixed(2)}/${l.matched.unitPrice.per}]` : '';
    console.log(`  ${stop.store.chain}: ${l.matched.name.slice(0, 55)} CHF ${l.lineTotal} ${u}`);
  }
}
