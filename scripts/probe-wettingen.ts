import { buildRegistry } from '../src/index.js';
import { findStoresHandler } from '../src/tools/find_stores.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

const r = buildRegistry();

console.log('=== Stores near 5430 Wettingen (5km) ===');
const stores = await findStoresHandler(r, { near: { zip: '5430' }, radiusKm: 5 });
const byChain: Record<string, number> = {};
for (const s of stores) byChain[s.chain] = (byChain[s.chain] ?? 0) + 1;
console.log(`Total: ${stores.length} stores`, byChain);
for (const s of stores.slice(0, 12)) {
  console.log(`  • ${s.chain.padEnd(7)} ${s.name} — ${s.address.zip} ${s.address.city}`);
}

console.log('\n=== plan_shopping near 5430 Wettingen (split_cart) ===');
const plan = await planShoppingHandler(r, {
  items: [
    { query: 'milch' },
    { query: 'brot' },
    { query: 'eier' },
    { query: 'pasta' },
    { query: 'käse' },
  ],
  near: { zip: '5430' },
  strategy: 'split_cart',
});
console.log(`Total: CHF ${plan.primary.totalChf.toFixed(2)} across ${plan.primary.stops.length} stop(s)`);
for (const stop of plan.primary.stops) {
  console.log(`\n→ ${stop.store.chain.toUpperCase()} ${stop.store.name ?? ''} (CHF ${stop.subtotalChf.toFixed(2)})`);
  for (const line of stop.items) {
    console.log(`   - ${line.requested.query.padEnd(8)} → ${line.matched.name.slice(0, 60)} CHF ${line.lineTotal.toFixed(2)}`);
  }
}
if (plan.primary.unmatchedItems?.length) {
  console.log(`\nUnmatched: ${plan.primary.unmatchedItems.map((i) => i.query).join(', ')}`);
}
console.log(`\nAlternatives:`);
for (const alt of plan.alternatives) {
  console.log(`  • ${alt.strategy}: CHF ${alt.totalChf.toFixed(2)} across ${alt.stops.length} stop(s)`);
}
