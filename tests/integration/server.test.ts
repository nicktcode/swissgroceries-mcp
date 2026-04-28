import { describe, it, expect } from 'vitest';
import { createServer, buildRegistry } from '../../src/index.js';

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
