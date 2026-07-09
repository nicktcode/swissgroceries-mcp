import { httpJson } from '../../util/http.js';

const BASE = 'https://www.farmy.ch';
const UA = 'Mozilla/5.0 (compatible; swissgroceries-mcp/1.0)';

export async function farmyFetch(
  path: string,
  query: Record<string, string | number | undefined> = {},
  noCache = false,
  language: 'de' | 'fr' | 'it' = 'de',
): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return httpJson(url.toString(), {
    // Language is part of the cache key so a French request isn't served a
    // cached German response. Best-effort — the API may ignore the locale.
    cacheKey: noCache ? undefined : `farmy:${language}:${url.toString()}`,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': `${language}-CH,${language};q=0.9`,
      },
    },
  });
}
