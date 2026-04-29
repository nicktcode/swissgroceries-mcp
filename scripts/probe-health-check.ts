import { buildRegistry } from '../src/index.js';
import { healthCheckHandler } from '../src/tools/health_check.js';

const r = buildRegistry();
const out = await healthCheckHandler(r, {});
for (const c of out.chains) {
  const status = !c.registered ? 'UNREGISTERED' : c.ok ? `OK ${c.latencyMs}ms` : `FAIL (${c.error?.code}: ${c.error?.reason ?? ''})`;
  console.log(`${c.chain}: ${status}`);
}
console.log('\nSummary:', out.summary);
