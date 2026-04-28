import type { Unit } from '../adapters/types.js';

export interface Size {
  value: number;
  unit: Unit;
}

export interface UnitPrice {
  value: number;
  per: 'kg' | 'l' | 'piece';
}

export function computeUnitPrice(
  priceChf: number,
  size: Size | undefined,
): UnitPrice | undefined {
  if (!size || size.value <= 0) return undefined;

  switch (size.unit) {
    case 'g':
      return { value: priceChf / (size.value / 1000), per: 'kg' };
    case 'kg':
      return { value: priceChf / size.value, per: 'kg' };
    case 'ml':
      return { value: priceChf / (size.value / 1000), per: 'l' };
    case 'l':
      return { value: priceChf / size.value, per: 'l' };
    case 'piece':
      return { value: priceChf / size.value, per: 'piece' };
  }
}
