import { httpJson } from '../../util/http.js';

const BASE = 'https://api.aldi-suisse.ch';
const UA = 'ALDI iOS App CH 9.2614.1 8';

export async function aldiFetch(
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
    // Language is part of the cache key: a French request must not be served a
    // cached German response. Best-effort — the API may ignore the locale.
    cacheKey: noCache ? undefined : `aldi:${language}:${url.toString()}`,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': `${language}_CH`,
      },
    },
  });
}

export const ALDI_DEFAULT_SERVICE_POINT = 'E172';
