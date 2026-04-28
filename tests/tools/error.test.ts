import { describe, it, expect } from 'vitest';
import { ToolError } from '../../src/tools/errors.js';

describe('ToolError', () => {
  it('has the correct name', () => {
    const e = new ToolError('some_code', 'some message');
    expect(e.name).toBe('ToolError');
  });

  it('stores code and message', () => {
    const e = new ToolError('unknown_zip', 'ZIP "9999" not found');
    expect(e.code).toBe('unknown_zip');
    expect(e.message).toBe('ZIP "9999" not found');
    expect(e.hint).toBeUndefined();
  });

  it('stores optional hint', () => {
    const e = new ToolError('unknown_zip', 'ZIP not found', 'Pass {lat, lng} instead');
    expect(e.hint).toBe('Pass {lat, lng} instead');
  });

  it('is an instance of Error', () => {
    const e = new ToolError('test', 'test message');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ToolError);
  });

  it('serialises to structured JSON correctly', () => {
    const e = new ToolError('not_found', 'Product not found', 'Re-run search_products');
    const json = JSON.parse(JSON.stringify({ error: e.code, message: e.message, hint: e.hint }));
    expect(json).toEqual({
      error: 'not_found',
      message: 'Product not found',
      hint: 'Re-run search_products',
    });
  });
});
