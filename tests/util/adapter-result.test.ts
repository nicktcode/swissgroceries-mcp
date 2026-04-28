import { describe, it, expect } from 'vitest';
import { ok, err, mapResult, isOk } from '../../src/util/adapter-result.js';

describe('adapter-result helpers', () => {
  it('ok wraps data', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it('err wraps an error', () => {
    expect(err({ code: 'not_found' })).toEqual({
      ok: false,
      error: { code: 'not_found' },
    });
  });

  it('isOk narrows the type', () => {
    const r = ok([1, 2, 3]);
    if (isOk(r)) {
      expect(r.data.length).toBe(3);
    } else {
      throw new Error('unreachable');
    }
  });

  it('mapResult transforms the data of an ok result', () => {
    const r = mapResult(ok(2), (x) => x * 10);
    expect(r).toEqual({ ok: true, data: 20 });
  });

  it('mapResult passes through err', () => {
    const r = mapResult(err({ code: 'not_found' }), (x: number) => x * 10);
    expect(r).toEqual({ ok: false, error: { code: 'not_found' } });
  });
});
