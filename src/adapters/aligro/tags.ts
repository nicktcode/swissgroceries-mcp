import type { Tag } from '../types.js';

const ALIGRO_TAG: Array<[RegExp, Tag]> = [
  [/\bbio\b|organic/i, 'organic'],
  [/benefit price|budget/i, 'budget'],
  [/premium|gourmet|s[eé]lection/i, 'premium'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/sans lactose|lactose[- ]?free|laktosefrei/i, 'lactose-free'],
  [/sans gluten|gluten[- ]?free|glutenfrei/i, 'gluten-free'],
  [/v[eé]gan/i, 'vegan'],
  [/v[eé]g[eé]tarien|vegetari/i, 'vegetarian'],
  [/sans sucre|sugar[- ]?free|zuckerfrei/i, 'sugar-free'],
  [/r[eé]gional/i, 'regional'],
];

/**
 * Derive coarse product tags from the free-text fields Aligro exposes
 * (name, brand, origin, category). Conservative: only emits a tag on a clear
 * lexical signal. Swiss origin maps to swiss-made.
 */
export function deriveAligroTags(parts: Array<string | null | undefined>): Tag[] {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of ALIGRO_TAG) if (rx.test(haystack)) out.add(tag);
  if (/\bsuisse\b|schweiz|schweizer/i.test(haystack)) out.add('swiss-made');
  return [...out];
}
