import { describe, it, expect } from 'vitest';
import { createServer, buildRegistry } from '../../src/index.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { AldiAdapter } from '../../src/adapters/aldi/index.js';
import { CoopAdapter } from '../../src/adapters/coop/index.js';

describe('server bootstrap', () => {
  it('builds a registry with at least one adapter', () => {
    const r = buildRegistry();
    expect(r.list().length).toBeGreaterThan(0);
  });

  it('createServer resolves without crashing', async () => {
    const s = await createServer();
    expect(s).toBeDefined();
  });
});

describe('swissgroceries://chains resource', () => {
  it('registry.list() returns chain+capabilities objects', () => {
    const r = new AdapterRegistry();
    r.register(new AldiAdapter());
    r.register(new CoopAdapter());
    const chains = r.list().map((a) => ({ chain: a.chain, capabilities: a.capabilities }));
    expect(chains.length).toBe(2);
    const aldiEntry = chains.find((c) => c.chain === 'aldi');
    expect(aldiEntry).toBeDefined();
    expect(aldiEntry?.capabilities.productSearch).toBe(true);
    const coopEntry = chains.find((c) => c.chain === 'coop');
    expect(coopEntry).toBeDefined();
    expect(coopEntry?.capabilities.perStoreStock).toBe(true);
  });

  it('resource payload is valid JSON with chains array', () => {
    const r = buildRegistry();
    const chains = r.list().map((a) => ({ chain: a.chain, capabilities: a.capabilities }));
    const text = JSON.stringify({ chains }, null, 2);
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.chains)).toBe(true);
    expect(parsed.chains.length).toBeGreaterThan(0);
    const chainNames = parsed.chains.map((c: any) => c.chain);
    expect(chainNames).toContain('migros');
    expect(chainNames).toContain('coop');
    expect(chainNames).toContain('aldi');
    expect(chainNames).toContain('denner');
    expect(chainNames).toContain('lidl');
  });
});
