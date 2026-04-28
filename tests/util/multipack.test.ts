import { describe, it, expect } from 'vitest';
import { detectPackCount, annotateMultipack } from '../../src/util/multipack.js';
import type { NormalizedProduct } from '../../src/adapters/types.js';

describe('detectPackCount', () => {
  it('detects "6x1.5l" pattern', () => expect(detectPackCount('Prix Garantie Apfelschorle 6x1.5l')).toBe(6));
  it('detects "12 x 50cl" pattern', () => expect(detectPackCount('Coca Cola 12 x 50cl')).toBe(12));
  it('detects "6×33cl" with unicode multiplication sign', () => expect(detectPackCount('Bier 6×33cl')).toBe(6));
  it('detects "4er Pack"', () => expect(detectPackCount('Hörnli 4er Pack')).toBe(4));
  it('detects "10er"', () => expect(detectPackCount('Eier 10er')).toBe(10));
  it('returns 1 for single product names', () => {
    expect(detectPackCount('Vollmilch UHT 1L')).toBe(1);
    expect(detectPackCount('Äpfel Gala')).toBe(1);
  });
  it('rejects nonsense like "9999er"', () => expect(detectPackCount('Test 9999er')).toBe(1));
});

describe('annotateMultipack', () => {
  function p(name: string, price: number, sizeValue: number, sizeUnit: any): NormalizedProduct {
    return {
      chain: 'coop', id: '1', name,
      price: { current: price, currency: 'CHF' },
      size: { value: sizeValue, unit: sizeUnit },
      tags: [],
    };
  }

  it('annotates a 6x1.5l multipack with per-unit price and size', () => {
    const product = p('Prix Garantie Apfelschorle 6x1.5l', 8.35, 9, 'l');
    annotateMultipack(product);
    expect(product.multipack).toEqual({
      count: 6,
      perUnitPrice: 1.39,
      perUnitSize: { value: 1.5, unit: 'l' },
    });
  });

  it('does nothing for single packs', () => {
    const product = p('Vollmilch UHT 1L', 1.85, 1, 'l');
    annotateMultipack(product);
    expect(product.multipack).toBeUndefined();
  });

  it('handles missing size — leaves perUnitSize undefined', () => {
    const product: NormalizedProduct = {
      chain: 'coop', id: '1', name: 'Apfelschorle 6x',
      price: { current: 6, currency: 'CHF' },
      tags: [],
    };
    // Won't actually trigger 6x without unit, so manually craft a name match
    const product2: NormalizedProduct = {
      chain: 'coop', id: '2', name: 'Eier 12er',
      price: { current: 6, currency: 'CHF' },
      tags: [],
    };
    annotateMultipack(product2);
    expect(product2.multipack?.count).toBe(12);
    expect(product2.multipack?.perUnitPrice).toBe(0.5);
    expect(product2.multipack?.perUnitSize).toBeUndefined();
  });
});
