const BASE = 'https://app-api.denner.ch';
const UA = 'ch.denner.mobile.Denner/6.1.00+ios/26.3.1';

export interface DennerClient {
  fetch(path: string, query?: Record<string, string | number | undefined>): Promise<any>;
}

export function makeDennerClient(jwt: string): DennerClient {
  return {
    async fetch(path, query = {}) {
      const url = new URL(BASE + path);
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'User-Agent': UA,
          'Accept': '*/*',
          'Accept-Language': 'de',
        },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Denner auth_expired: ${res.status}`);
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Denner ${res.status}: ${t.slice(0, 200)}`);
      }
      return res.json();
    },
  };
}
