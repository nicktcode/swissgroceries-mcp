import type { NormalizedProduct, Unit } from '../adapters/types.js';

/**
 * Detect pack count from product names like "6x1.5l", "12 x 50cl", "4er Pack".
 * Returns 1 if not a recognised multipack pattern.
 */
export function detectPackCount(name: string): number {
  const m1 = name.match(/(\d+)\s*[x×]\s*[\d.,]+\s*(?:g|kg|ml|cl|dl|l)\b/i);
  if (m1) return parseInt(m1[1], 10);
  const m2 = name.match(/\b(\d+)\s*er(?:[\s-]?pack)?\b/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 2 && n <= 100) return n;
  }
  return 1;
}

/**
 * If the product looks like a multipack, populate `product.multipack` with the
 * derived per-unit price and per-unit size. Mutates the product in place and
 * returns it for chaining.
 */
export function annotateMultipack(product: NormalizedProduct): NormalizedProduct {
  const count = detectPackCount(product.name);
  if (count <= 1) return product;
  if (!(product.price.current > 0)) return product;

  const perUnitPrice = product.price.current / count;
  let perUnitSize: { value: number; unit: Unit } | undefined;
  if (product.size && product.size.value > 0) {
    perUnitSize = {
      value: product.size.value / count,
      unit: product.size.unit,
    };
  }
  product.multipack = {
    count,
    perUnitPrice: Math.round(perUnitPrice * 100) / 100,
    perUnitSize,
  };
  return product;
}
