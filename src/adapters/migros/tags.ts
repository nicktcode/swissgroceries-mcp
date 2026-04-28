import type { Tag } from '../types.js';

const MIGROS_LABEL_TAG: Array<[RegExp, Tag]> = [
  [/naturaplan|bio/i, 'organic'],
  [/m[- ]?budget|prix garantie/i, 'budget'],
  [/sélection|fine food|s[eé]lection/i, 'premium'],
  [/max havelaar|fairtrade/i, 'fairtrade'],
  [/lactose[- ]?free|laktosefrei|sans lactose/i, 'lactose-free'],
  [/gluten[- ]?free|glutenfrei|sans gluten/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/v[eé]g[eé]tarien|vegetarisch/i, 'vegetarian'],
  [/sucre|sugar[- ]?free|zuckerfrei/i, 'sugar-free'],
  [/aus der region|terra suisse/i, 'regional'],
  [/swiss made|schweizer|suisse/i, 'swiss-made'],
];

export function deriveTags(productLabels: string[], productName: string): Tag[] {
  const haystack = [productName, ...productLabels].join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of MIGROS_LABEL_TAG) {
    if (rx.test(haystack)) out.add(tag);
  }
  return [...out];
}
