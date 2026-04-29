import { httpJson } from '../../util/http.js';

const BASE = 'https://www.farmy.ch';
const UA = 'Mozilla/5.0 (compatible; swissgroceries-mcp/1.0)';

export async function farmyFetch(
  path: string,
  query: Record<string, string | number | undefined> = {},
  noCache = false,
): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return httpJson(url.toString(), {
    cacheKey: noCache ? undefined : `farmy:${url.toString()}`,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    },
  });
}
