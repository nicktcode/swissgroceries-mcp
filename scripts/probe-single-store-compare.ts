import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';
import type { Chain, NormalizedProduct } from '../src/adapters/types.js';

const r = buildRegistry();
const items = [{ query: 'apfel' }, { query: 'apfelschorle' }];
const chains: Chain[] = ['migros', 'coop', 'aldi', 'lidl'];

/**
 * Detect pack count from product names like "6x1.5l" / "12 x 50cl" / "4er Pack".
 * Returns 1 if not a multipack.
 */
function packCount(name: string): number {
  const m1 = name.match(/(\d+)\s*[x×]\s*[\d.,]+\s*(?:g|kg|ml|cl|dl|l)/i);
  if (m1) return parseInt(m1[1], 10);
  const m2 = name.match(/\b(\d+)er\b/i);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}

function describeLine(p: NormalizedProduct): string {
  const u = p.unitPrice ? ` [${p.unitPrice.value.toFixed(2)}/${p.unitPrice.per}]` : '';
  const pc = packCount(p.name);
  const perBottle =
    pc > 1
      ? ` ≈ CHF ${(p.price.current / pc).toFixed(2)} per single (${pc}-pack)`
      : '';
  return `${p.name.slice(0, 55)} CHF ${p.price.current.toFixed(2)}${u}${perBottle}`;
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
