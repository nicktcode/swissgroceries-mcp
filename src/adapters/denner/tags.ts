import type { Tag } from '../types.js';

const DENNER_LABEL_TAG: Array<[RegExp, Tag]> = [
  [/bio|naturafarm|bio-eu/i, 'organic'],
  [/budget|prix bas|tiefpreis/i, 'budget'],
  [/premium|top class/i, 'premium'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/laktose|lactose/i, 'lactose-free'],
  [/gluten/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/vegetari/i, 'vegetarian'],
  [/zucker|sugar/i, 'sugar-free'],
  [/regional/i, 'regional'],
  [/schweiz|swiss|suisse/i, 'swiss-made'],
];

export function deriveDennerTags(name: string, ecoLabels: string[] = []): Tag[] {
  const haystack = [name, ...ecoLabels].join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of DENNER_LABEL_TAG) if (rx.test(haystack)) out.add(tag);
  return [...out];
}
