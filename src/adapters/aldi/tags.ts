import type { Tag } from '../types.js';

const ALDI_LABEL_TAG: Array<[RegExp, Tag]> = [
  [/bio|organic/i, 'organic'],
  [/everyday|preisvorteil/i, 'budget'],
  [/specially selected|gourmet/i, 'premium'],
  [/fairtrade/i, 'fairtrade'],
  [/lactose|laktose/i, 'lactose-free'],
  [/gluten/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/v[eé]g[eé]tari/i, 'vegetarian'],
  [/sugar[- ]?free|zuckerfrei/i, 'sugar-free'],
  [/regional/i, 'regional'],
  [/swiss|schweizer/i, 'swiss-made'],
];

export function deriveAldiTags(name: string, labels: string[] = []): Tag[] {
  const haystack = [name, ...labels].join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of ALDI_LABEL_TAG) if (rx.test(haystack)) out.add(tag);
  return [...out];
}
