import { describe, it, expect } from 'vitest';
import { computeUnitPrice } from '../../src/util/unit-price.js';

describe('computeUnitPrice', () => {
  it('returns CHF/kg for grams', () => {
    expect(computeUnitPrice(2.5, { value: 500, unit: 'g' })).toEqual({
      value: 5,
      per: 'kg',
    });
  });

  it('returns CHF/kg for kilograms', () => {
    expect(computeUnitPrice(12, { value: 2, unit: 'kg' })).toEqual({
      value: 6,
      per: 'kg',
    });
  });

  it('returns CHF/l for milliliters', () => {
    expect(computeUnitPrice(1.45, { value: 1000, unit: 'ml' })).toEqual({
      value: 1.45,
      per: 'l',
    });
  });

  it('returns CHF/l for liters', () => {
    expect(computeUnitPrice(2.9, { value: 1.5, unit: 'l' })).toEqual({
      value: expect.closeTo(1.9333, 3),
      per: 'l',
    });
  });

  it('returns CHF/piece for piece-sold items', () => {
    expect(computeUnitPrice(4.5, { value: 6, unit: 'piece' })).toEqual({
      value: 0.75,
      per: 'piece',
    });
  });

  it('returns undefined when size is missing', () => {
    expect(computeUnitPrice(1.45, undefined)).toBeUndefined();
  });

  it('returns undefined when size value is zero', () => {
    expect(computeUnitPrice(1.45, { value: 0, unit: 'kg' })).toBeUndefined();
  });
});
