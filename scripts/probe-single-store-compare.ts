import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';
import type { Chain, NormalizedProduct } from '../src/adapters/types.js';

const r = buildRegistry();
const items = [{ query: 'apfel' }, { query: 'apfelschorle' }];
const chains: Chain[] = ['migros', 'coop', 'aldi', 'lidl'];

function describeLine(p: NormalizedProduct): string {
  const u = p.unitPrice ? ` [${p.unitPrice.value.toFixed(2)}/${p.unitPrice.per}]` : '';
  const m = p.multipack
    ? ` ≈ CHF ${p.multipack.perUnitPrice.toFixed(2)} per single (${p.multipack.count}-pack)`
    : '';
  return `${p.name.slice(0, 55)} CHF ${p.price.current.toFixed(2)}${u}${m}`;
}

console.log('Single-store comparison for: apfel + apfelschorle near 5430 Wettingen\n');

const results: Array<{ chain: Chain; total: number; coverage: number; lines: string[] }> = [];

for (const chain of chains) {
  const out = await planShoppingHandler(r, {
    items,
    near: { zip: '5430' },
    strategy: 'single_store',
    chains: [chain],
  });
  const stop = out.primary.stops[0];
  const lines = stop?.items.map((l) => `${l.requested.query.padEnd(15)} → ${describeLine(l.matched)}`) ?? [];
  results.push({
    chain,
    total: out.primary.totalChf,
    coverage: stop?.items.length ?? 0,
    lines,
  });
}

results.sort((a, b) => {
  if (a.coverage !== b.coverage) return b.coverage - a.coverage;
  return a.total - b.total;
});

for (const res of results) {
  if (res.coverage === 0) {
    console.log(`${res.chain.toUpperCase().padEnd(8)} — no items matched\n`);
    continue;
  }
  console.log(`${res.chain.toUpperCase().padEnd(8)} CHF ${res.total.toFixed(2).padStart(6)} (${res.coverage}/${items.length} items)`);
  for (const l of res.lines) console.log(`  ${l}`);
  console.log();
}

const winner = results.find((r) => r.coverage === items.length);
if (winner) {
  console.log(`>>> Cheapest single-store option: ${winner.chain.toUpperCase()} at CHF ${winner.total.toFixed(2)}`);
}
