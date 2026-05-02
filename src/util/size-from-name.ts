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
//   - 'ml' alternation comes before 'l' so "500ml" doesn't read as "500l".
//
// Intentionally NOT applied unconditionally — only when adapter.normalize()
// has already exhausted its primary size source. Otherwise we'd override
// well-curated structured fields with a fuzzier regex match.
const RX = /(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|dl|l|stück|stueck|stk|st|er|pieces?|g)\b/i;

export function sizeFromName(name: string | undefined | null): { value: number; unit: Unit } | undefined {
  if (!name) return undefined;
  const m = name.match(RX);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  switch (m[2].toLowerCase()) {
    case 'g': return { value, unit: 'g' };
    case 'kg': return { value, unit: 'kg' };
    case 'ml': return { value, unit: 'ml' };
    case 'cl': return { value: value * 10, unit: 'ml' };
    case 'dl': return { value: value * 100, unit: 'ml' };
    case 'l': return { value, unit: 'l' };
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
