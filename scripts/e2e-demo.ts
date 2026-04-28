/**
 * End-to-end demo: hit real APIs through the MCP handlers.
 * Run: npx tsx scripts/e2e-demo.ts
 */
import { buildRegistry } from '../src/index.js';
import { findStoresHandler } from '../src/tools/find_stores.js';
import { searchProductsHandler } from '../src/tools/search_products.js';
import { getPromotionsHandler } from '../src/tools/get_promotions.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

function header(s: string) {
  console.log('\n' + '═'.repeat(72));
  console.log(s);
  console.log('═'.repeat(72));
}

function summarize(label: string, items: any[], pick = 3) {
  console.log(`\n${label} (${items.length}):`);
  for (const it of items.slice(0, pick)) {
    if (it.address) {
      console.log(`  • ${it.chain.padEnd(7)} ${it.name} — ${it.address.zip} ${it.address.city}`);
    } else if (it.price) {
      const u = it.unitPrice ? ` (${it.unitPrice.value.toFixed(2)} CHF/${it.unitPrice.per})` : '';
      console.log(`  • ${it.chain.padEnd(7)} ${it.name} — CHF ${it.price.current.toFixed(2)}${u}`);
    } else {
      console.log(`  • ${JSON.stringify(it).slice(0, 100)}`);
    }
  }
  if (items.length > pick) console.log(`  … and ${items.length - pick} more`);
}

async function main() {
  const registry = buildRegistry();
  console.log(`Registered chains: ${registry.list().map((a) => a.chain).join(', ')}`);

  // 1. find_stores near 8001
  header('1. find_stores near 8001 Zürich (5km)');
  const stores = await findStoresHandler(registry, { near: { zip: '8001' }, radiusKm: 5 });
  summarize('Stores', stores, 8);

  // 2. search_products('milch')
  header('2. search_products("milch") across all chains');
  const search = await searchProductsHandler(registry, { query: 'milch', limit: 3 });
  for (const [chain, products] of Object.entries(search.byChain)) {
    summarize(`${chain} milk`, products ?? [], 3);
  }
  if (search.errors?.length) {
    console.log('\nErrors:', search.errors);
  }

  // 3. get_promotions
  header('3. get_promotions ("aktion") across all chains');
  const promos = await getPromotionsHandler(registry, { query: '' });
  console.log(`Total promotions: ${promos.length}`);
  const byChain: Record<string, number> = {};
  for (const p of promos) byChain[p.chain] = (byChain[p.chain] ?? 0) + 1;
  console.log('By chain:', byChain);
  summarize('Sample promos', promos, 5);

  // 4. plan_shopping — the headline scenario
  header('4. plan_shopping: "milch, brot, eier, pasta, käse" near 8001 Zürich (split_cart)');
  const plan = await planShoppingHandler(registry, {
    items: [
      { query: 'milch' },
      { query: 'brot' },
      { query: 'eier' },
      { query: 'pasta' },
      { query: 'käse' },
    ],
    near: { zip: '8001' },
    strategy: 'split_cart',
    splitPenaltyChf: 2.0,
  });

  console.log(`\nPrimary plan (${plan.primary.strategy}):`);
  console.log(`  Total: CHF ${plan.primary.totalChf.toFixed(2)}`);
  console.log(`  Stops: ${plan.primary.stops.length}`);
  for (const stop of plan.primary.stops) {
    console.log(`\n  → ${stop.store.chain.toUpperCase()} ${stop.store.name ?? ''} (subtotal CHF ${stop.subtotalChf.toFixed(2)})`);
    for (const line of stop.items) {
      console.log(`     - ${line.requested.query.padEnd(8)} → ${line.matched.name.slice(0, 60)} CHF ${line.lineTotal.toFixed(2)}`);
    }
  }
  if (plan.primary.unmatchedItems?.length) {
    console.log(`\n  Unmatched: ${plan.primary.unmatchedItems.map((i) => i.query).join(', ')}`);
  }
  if (plan.primary.unavailableChains?.length) {
    console.log(`\n  Chains with errors: ${JSON.stringify(plan.primary.unavailableChains)}`);
  }

  console.log(`\nAlternatives (${plan.alternatives.length}):`);
  for (const alt of plan.alternatives) {
    console.log(`  • ${alt.strategy}: CHF ${alt.totalChf.toFixed(2)} across ${alt.stops.length} stop(s)`);
  }

  // 5. Single-store strategy comparison
  header('5. Same list, single_store strategy');
  const single = await planShoppingHandler(registry, {
    items: [
      { query: 'milch' },
      { query: 'brot' },
      { query: 'eier' },
      { query: 'pasta' },
      { query: 'käse' },
    ],
    near: { zip: '8001' },
    strategy: 'single_store',
  });
  console.log(`Best single store: ${single.primary.stops[0]?.store.chain ?? 'none'} — CHF ${single.primary.totalChf.toFixed(2)}`);
  if (single.primary.unmatchedItems?.length) {
    console.log(`Unmatched at chosen chain: ${single.primary.unmatchedItems.map((i) => i.query).join(', ')}`);
  }
}

main().catch((e) => {
  console.error('E2E demo failed:', e);
  process.exit(1);
});
