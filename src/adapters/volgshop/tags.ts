import type { Tag } from '../types.js';

const VOLG_TAG: Array<[RegExp, Tag]> = [
  [/bio|organic/i, 'organic'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/lactose|laktose|laktosefrei/i, 'lactose-free'],
  [/glutenfrei|gluten[- ]?free/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/v[eé]g[eé]tari/i, 'vegetarian'],
  [/zuckerfrei|sugar[- ]?free/i, 'sugar-free'],
  [/regional/i, 'regional'],
  [/swiss|schweiz|schweizer/i, 'swiss-made'],
];

export function deriveVolgshopTags(name: string, categoryNames: string[] = [], tagNames: string[] = []): Tag[] {
  const haystack = [name, ...categoryNames, ...tagNames].join(' ');
  const out = new Set<Tag>();
  for (const [rx, tag] of VOLG_TAG) if (rx.test(haystack)) out.add(tag);
  return [...out];
}
