import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

const r = buildRegistry();

const items = [
  { query: 'bananen' },
  { query: 'magerquark' },
  { query: 'gefrorene himbeeren' },
  { query: 'mandelmilch' },
  { query: 'apfel' },
  { query: 'haferflocken' },
];

for (const strategy of ['split_cart', 'single_store', 'absolute_cheapest'] as const) {
  console.log(`\n══════ strategy: ${strategy} ══════`);
  const out = await planShoppingHandler(r, {
    items,
    near: { zip: '5430' },
    strategy,
  });
  console.log(`Total: CHF ${out.primary.totalChf.toFixed(2)} across ${out.primary.stops.length} stop(s)`);
  for (const stop of out.primary.stops) {
    console.log(`\n→ ${stop.store.chain.toUpperCase()} ${stop.store.name ?? ''} (CHF ${stop.subtotalChf.toFixed(2)})`);
    for (const line of stop.items) {
      const u = line.matched.unitPrice ? ` [${line.matched.unitPrice.value.toFixed(2)}/${line.matched.unitPrice.per}]` : '';
      console.log(`   - ${line.requested.query.padEnd(20)} → ${line.matched.name.slice(0, 55)} CHF ${line.lineTotal.toFixed(2)}${u}`);
    }
  }
  if (out.primary.unmatchedItems?.length) {
    console.log(`\nUnmatched: ${out.primary.unmatchedItems.map(i => i.query).join(', ')}`);
  }
  if (out.primary.unavailableChains?.length) {
    console.log(`Errors: ${JSON.stringify(out.primary.unavailableChains.map(c => c.chain))}`);
  }
}
