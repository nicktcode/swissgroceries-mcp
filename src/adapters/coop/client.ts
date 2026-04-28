const BASE = 'https://www.coop.ch/rest/v2/coopathome';
const UA = process.env.SWISSGROCERIES_USER_AGENT_COOP
  ?? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

export interface CoopFetchOpts {
  query?: Record<string, string | number | undefined>;
  language?: string;
}

export async function coopFetch(path: string, opts: CoopFetchOpts = {}): Promise<unknown> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  if (opts.language) url.searchParams.set('language', opts.language);
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coop ${res.status}: ${text.slice(0, 200)}`);
  }
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('json')) {
    const text = await res.text();
    throw new Error(`Coop returned non-JSON (likely DataDome challenge): ${text.slice(0, 200)}`);
  }
  return res.json();
}
