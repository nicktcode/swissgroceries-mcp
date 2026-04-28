import { httpJson } from '../../util/http.js';

const BASE = 'https://api.aldi-suisse.ch';
const UA = 'ALDI iOS App CH 9.2614.1 8';

export async function aldiFetch(
  path: string,
  query: Record<string, string | number | undefined> = {},
  noCache = false,
): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return httpJson(url.toString(), {
    cacheKey: noCache ? undefined : `aldi:${url.toString()}`,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'de_CH',
      },
    },
  });
}

export const ALDI_DEFAULT_SERVICE_POINT = 'E172';
