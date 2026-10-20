import type { Unit } from '../adapters/types.js';

// Last-resort size extractor — pulls a size from the product name when the
// adapter's structured fields didn't yield one. Used as a fallback so chain
// APIs that omit size (or encode it only in the human-readable name) still
// rank with everyone else.
//
// Conservative on purpose:
//   - matches the FIRST plausible size token in the name; doesn't try to
//     reconcile multiple (e.g. "53g+ 10 Stück" returns 53g first, which is
//     why callers should prefer structured fields and only fall back here).
//   - rejects size 0 and non-finite values (defensive against crap data).
//   - longer unit spellings come first in the alternation so "500ml" doesn't
//     read as "500l" and "1,5 Liter" doesn't stop at "l".
//
// Multipacks ("6x50cl", "6 x 1,5 Liter", "24 × 33 cl") return the TOTAL pack
// size, matching the NormalizedProduct.size convention; annotateMultipack
// derives the per-unit numbers from it.
//
// Intentionally NOT applied unconditionally — only when adapter.normalize()
// has already exhausted its primary size source. Otherwise we'd override
// well-curated structured fields with a fuzzier regex match.
const UNIT = '(kg|ml|cl|dl|liters?|litres?|ltr|lt|l|stück|stueck|stk|st|er|pieces?|g)';
const RX = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\b`, 'i');
const PACK_RX = new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\b`, 'i');

function toSize(value: number, unitRaw: string): { value: number; unit: Unit } | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = unitRaw.toLowerCase();
  if (/^(liters?|litres?|ltr|lt|l)$/.test(unit)) return { value, unit: 'l' };
  switch (unit) {
    case 'g': return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'er':
    case 'st':
    case 'stk':
    case 'stück':
    case 'stueck':
    case 'piece':
    case 'pieces':
      return { value, unit: 'piece' };
  }
  return undefined;
}

/** Pack count + per-unit size for "N x M unit" text, or undefined if not a multipack. */
export function parsePack(text: string | undefined | null): { count: number; unitSize: { value: number; unit: Unit } } | undefined {
  if (!text) return undefined;
  const m = text.match(PACK_RX);
  if (!m) return undefined;
  const count = parseInt(m[1], 10);
  const unitSize = toSize(parseFloat(m[2].replace(',', '.')), m[3]);
  if (!unitSize || !(count >= 2) || unitSize.unit === 'piece') return undefined;
  return { count, unitSize };
}

export function sizeFromName(name: string | undefined | null): { value: number; unit: Unit } | undefined {
  if (!name) return undefined;
  const pack = parsePack(name);
  if (pack) return { value: pack.unitSize.value * pack.count, unit: pack.unitSize.unit };
  const m = name.match(RX);
  if (!m) return undefined;
  return toSize(parseFloat(m[1].replace(',', '.')), m[2]);
}
