import { buildRegistry } from '../src/index.js';
import { planShoppingHandler } from '../src/tools/plan_shopping.js';

const r = buildRegistry();
const out = await planShoppingHandler(r, {
  items: [{ query: 'pasta' }],
  near: { zip: '8001' },
  strategy: 'split_cart',
});

console.log(JSON.stringify(out, null, 2));
