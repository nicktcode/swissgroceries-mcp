import { describe, it, expect } from 'vitest';
import type {
  Chain,
  Tag,
  Unit,
  NormalizedProduct,
  NormalizedStore,
  NormalizedPromotion,
  StoreAdapter,
  AdapterResult,
  AdapterError,
} from '../../src/adapters/types.js';

describe('adapter types', () => {
  it('Chain union is exhaustive for v1', () => {
    const all: Chain[] = ['migros', 'coop', 'aldi', 'denner', 'lidl'];
    expect(all.length).toBe(5);
  });

  it('AdapterResult discriminates on ok', () => {
    const ok: AdapterResult<number> = { ok: true, data: 1 };
    const err: AdapterResult<number> = { ok: false, error: { code: 'unavailable', reason: 'x' } };
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
  });

  it('NormalizedProduct accepts a minimal valid product', () => {
    const p: NormalizedProduct = {
      chain: 'migros',
      id: '100208234',
      name: 'M-Budget Milch UHT 1L',
      price: { current: 1.45, currency: 'CHF' },
      tags: ['budget'],
    };
    expect(p.chain).toBe('migros');
  });
});
