import type { Tag } from '../types.js';

const COOP_LABEL_TAG: Array<[RegExp, Tag]> = [
  [/naturaplan|bio|biofarm/i, 'organic'],
  [/prix garantie|qualité prix/i, 'budget'],
  [/fine food|sapori d['e]italia|sélection/i, 'premium'],
  [/max havelaar|fairtrade/i, 'fairtrade'],
  [/lactose|laktose|sans lactose/i, 'lactose-free'],
  [/gluten/i, 'gluten-free'],
  [/vegan/i, 'vegan'],
  [/v[eé]g[eé]tari/i, 'vegetarian'],
  [/zucker|sugar/i, 'sugar-free'],
  [/aus der region|miini region/i, 'regional'],
  [/swiss|schweizer|suisse/i, 'swiss-made'],
];

export interface CoopBooleanFlags {
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  lactoseFree?: boolean;
  regionalProduct?: boolean;
}

export function deriveCoopTags(labels: string[], name: string, flags?: CoopBooleanFlags): Tag[] {
  const haystack = [name, ...labels].join(' ').toLowerCase();
  const out = new Set<Tag>();
  for (const [rx, tag] of COOP_LABEL_TAG) {
    if (rx.test(haystack)) out.add(tag);
  }
  // Use boolean flags from the API when available (more reliable than text matching)
  if (flags?.vegan) out.add('vegan');
  if (flags?.vegetarian) out.add('vegetarian');
  if (flags?.glutenFree) out.add('gluten-free');
  if (flags?.lactoseFree) out.add('lactose-free');
  if (flags?.regionalProduct) out.add('regional');
  return [...out];
}
