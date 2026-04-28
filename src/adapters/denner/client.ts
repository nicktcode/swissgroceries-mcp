import { httpJson } from '../../util/http.js';

const BASE = 'https://app-api.denner.ch';
const UA = 'ch.denner.mobile.Denner/6.1.00+ios/26.3.1';

export interface DennerClient {
  fetch(path: string, query?: Record<string, string | number | undefined>, noCache?: boolean): Promise<any>;
}

export function makeDennerClient(jwt: string): DennerClient {
  return {
    async fetch(path, query = {}, noCache = false) {
      const url = new URL(BASE + path);
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
      return httpJson(url.toString(), {
        cacheKey: noCache ? undefined : `denner:${url.toString()}`,
        init: {
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'User-Agent': UA,
            'Accept': '*/*',
            'Accept-Language': 'de',
          },
        },
      });
    },
  };
}
