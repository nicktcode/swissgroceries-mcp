import { describe, it, expect } from 'vitest';
import { sizeFromName, parsePack } from '../../src/util/size-from-name.js';

describe('sizeFromName', () => {
  it('returns the total pack size for multipacks', () => {
    expect(sizeFromName('Coca-Cola 6x50cl')).toEqual({ value: 3000, unit: 'ml' });
    expect(sizeFromName('Coca-Cola Original Taste 24 x 33 cl')).toEqual({ value: 7920, unit: 'ml' });
    expect(sizeFromName('Bier 6×33cl')).toEqual({ value: 1980, unit: 'ml' });
  });
  it('understands written-out litres', () => {
    expect(sizeFromName('Rivella rot 6 x 1,5 Liter')).toEqual({ value: 9, unit: 'l' });
    expect(sizeFromName('Rivella Gelb Refresh 6x1.5 Liter')).toEqual({ value: 9, unit: 'l' });
    expect(sizeFromName('Apfelsaft 1 Liter')).toEqual({ value: 1, unit: 'l' });
  });
  it('still reads single sizes', () => {
    expect(sizeFromName('Nivea Shampoo 50ml Travel Size')).toEqual({ value: 50, unit: 'ml' });
    expect(sizeFromName('Butter 250g')).toEqual({ value: 250, unit: 'g' });
  });
  it('returns undefined without a size', () => expect(sizeFromName('Äpfel Gala')).toBeUndefined());
});

describe('parsePack', () => {
  it('parses count and per-unit size', () => {
    expect(parsePack('6 x 330ml')).toEqual({ count: 6, unitSize: { value: 330, unit: 'ml' } });
  });
  it('ignores non-packs', () => {
    expect(parsePack('1.5l')).toBeUndefined();
    expect(parsePack('1 x 1l')).toBeUndefined();
  });
});
