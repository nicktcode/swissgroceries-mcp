import type { AdapterResult, AdapterError } from '../adapters/types.js';

export function ok<T>(data: T): AdapterResult<T> {
  return { ok: true, data };
}

export function err<T = never>(error: AdapterError): AdapterResult<T> {
  return { ok: false, error };
}

export function isOk<T>(r: AdapterResult<T>): r is { ok: true; data: T } {
  return r.ok;
}

export function mapResult<T, U>(
  r: AdapterResult<T>,
  fn: (data: T) => U,
): AdapterResult<U> {
  return r.ok ? { ok: true, data: fn(r.data) } : r;
}
