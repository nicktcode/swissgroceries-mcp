import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

const r = buildRegistry();

const out = await planShoppingHandler(r, {
  items: [{ query: 'apfel' }, { query: 'apfelschorle' }],
  near: { zip: '5430' },
  strategy: 'split_cart',
});

console.log(`Total: CHF ${out.primary.totalChf.toFixed(2)} across ${out.primary.stops.length} stop(s)\n`);
for (const stop of out.primary.stops) {
  console.log(`→ ${stop.store.chain.toUpperCase()} ${stop.store.name ?? ''} (CHF ${stop.subtotalChf.toFixed(2)})`);
  for (const line of stop.items) {
    console.log(`   - ${line.requested.query.padEnd(15)} → ${line.matched.name.slice(0, 60)} CHF ${line.lineTotal.toFixed(2)}`);
  }
}
if (out.primary.unmatchedItems?.length) {
  console.log(`\nUnmatched: ${out.primary.unmatchedItems.map(i => i.query).join(', ')}`);
}
console.log('\nAlternatives:');
for (const alt of out.alternatives) {
  console.log(`  • ${alt.strategy}: CHF ${alt.totalChf.toFixed(2)} across ${alt.stops.length} stop(s)`);
}
