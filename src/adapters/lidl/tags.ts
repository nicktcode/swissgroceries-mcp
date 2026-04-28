import type { Tag } from '../types.js';

const LIDL_LABEL_TAG: Array<[RegExp, Tag]> = [
  [/bio|organic/i, 'organic'],
  [/everyday|preisvorteil/i, 'budget'],
  [/deluxe|premium/i, 'premium'],
  [/fairtrade|fair[- ]?glob/i, 'fairtrade'],
  [/laktose|lactose/i, 'lactose-free'],
  [/gluten/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/vegetari/i, 'vegetarian'],
  [/zuckerfrei|sugar[- ]?free/i, 'sugar-free'],
  [/regional/i, 'regional'],
  [/schweiz|suisse|swiss/i, 'swiss-made'],
];

export function deriveLidlTags(name: string, labels: string[] = []): Tag[] {
  const haystack = [name, ...labels].join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of LIDL_LABEL_TAG) if (rx.test(haystack)) out.add(tag);
  return [...out];
}
