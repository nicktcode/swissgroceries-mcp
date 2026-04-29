import type { Tag } from '../types.js';

const FARMY_NAME_TAG: Array<[RegExp, Tag]> = [
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

const FARMY_CERTIFICATE_TAG: Array<[RegExp, Tag]> = [
  [/bio|biosuisse|ch[- ]?bio|knospe/i, 'organic'],
  [/fairtrade|max havelaar/i, 'fairtrade'],
  [/demeter/i, 'organic'],
];

export function deriveFarmyTags(
  name: string,
  certificateNames: string[] = [],
  categoryNames: string[] = [],
): Tag[] {
  const out = new Set<Tag>();
  const haystack = [name, ...categoryNames].join(' ');
  for (const [rx, tag] of FARMY_NAME_TAG) if (rx.test(haystack)) out.add(tag);
  for (const cert of certificateNames) {
    for (const [rx, tag] of FARMY_CERTIFICATE_TAG) if (rx.test(cert)) out.add(tag);
  }
  return [...out];
}
