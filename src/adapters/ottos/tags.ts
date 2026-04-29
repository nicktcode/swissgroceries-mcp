import type { Tag } from '../types.js';

const OTTOS_TAG: Array<[RegExp, Tag]> = [
  [/bio|organic/i, 'organic'],
  [/budget|preisvorteil/i, 'budget'],
  [/premium|gourmet/i, 'premium'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/lactose|laktose|laktosefrei/i, 'lactose-free'],
  [/glutenfrei|gluten[- ]?free/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/v[eé]g[eé]tari/i, 'vegetarian'],
  [/zuckerfrei|sugar[- ]?free/i, 'sugar-free'],
  [/regional/i, 'regional'],
  [/swiss|schweiz|schweizer/i, 'swiss-made'],
];

export function deriveOttosTags(name: string, brand: string | undefined, categoryNames: string[] = [], labels: string[] = []): Tag[] {
  const haystack = [name, brand ?? '', ...categoryNames, ...labels].join(' ');
  const out = new Set<Tag>();
  for (const [rx, tag] of OTTOS_TAG) if (rx.test(haystack)) out.add(tag);
  return [...out];
}
