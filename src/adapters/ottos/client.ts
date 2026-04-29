import { httpJson } from '../../util/http.js';

const BASE = 'https://api.ottos.ch/occ/v2/ottos';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E1';

export const OTTOS_FOOD_CATEGORY = 'm_10100'; // "Lebensmittel" root category

export async function ottosFetch(
  path: string,
  query: Record<string, string | number | undefined> = {},
  noCache = false,
): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return httpJson(url.toString(), {
    cacheKey: noCache ? undefined : `ottos:${url.toString()}`,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    },
  });
}
