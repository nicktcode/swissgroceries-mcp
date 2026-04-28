import { CoopAdapter } from '../src/adapters/coop/index.js';
import { isMultipack } from '../src/services/matcher.js';

const c = new CoopAdapter();
const r = await c.searchProducts({ query: 'apfelschorle', limit: 100 });
if (!r.ok) { console.log('error', r.error); process.exit(1); }
console.log(`Total Coop results: ${r.data.length}`);
for (const p of r.data) {
  const sz = p.size ? `${p.size.value}${p.size.unit}` : 'no-size';
  const mp = isMultipack(p) ? '[MULTI]' : '[single?]';
  console.log(`  ${mp} ${p.name.slice(0, 60).padEnd(60)} | CHF ${p.price.current} | ${sz}`);
}
