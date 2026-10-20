import { httpJson } from '../../util/http.js';

// Coop City (department stores) runs its own SAP Commerce base site,
// separate from coop.ch's `coopathome`. The coop-city.ch HTML storefront is
// behind DataDome, but the OCC REST API answers plain JSON. Verified live
// 2026-10-20.
const BASE = 'https://www.coop-city.ch/rest/v2/city';
const UA = process.env.SWISSGROCERIES_USER_AGENT_COOPCITY
  ?? process.env.SWISSGROCERIES_USER_AGENT_COOP
  ?? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

export async function coopCityFetch(
  path: string,
  query: Record<string, string | number | undefined> = {},
  noCache = false,
): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return httpJson(url.toString(), {
    cacheKey: noCache ? undefined : `coopcity:${url.toString()}`,
    // Shares Coop's DataDome tenant; stay well below what a browser does.
    rateLimitPerSec: 2,
    init: {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    },
  });
}
