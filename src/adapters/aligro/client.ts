import { httpJson } from '../../util/http.js';

const BASE = 'https://www.aligro.ch';
// Aligro's SSR needs a desktop UA to return the fully rendered page (and its
// embedded data island) rather than a stub.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// Aligro (Groupe Demaurex cash & carry) runs a Vue SSR frontend with NO clean
// product REST API. Search results are server-rendered into an HTML-entity-
// encoded JSON island carried by an <articles-pagination pagination="..."> tag.
// We fetch the search HTML and extract that island. Only /api/markets/ is a
// real JSON endpoint.
const ISLAND_RX = /<articles-pagination\b[^>]*\spagination="([^"]*)"/;

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function fetchText(url: string, retries = 3, backoffMs = 250): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/HTTP 4\d\d/.test(msg)) throw e; // permanent client error — don't retry
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

export interface AligroSearchOpts {
  /** Fetch NEXT week's promotions instead of the current week (Aligro-only). */
  nextWeek?: boolean;
  /** 1-based page number. Aligro serves 48 items per page. */
  page?: number;
}

/**
 * Fetch one page of Aligro search results and return the decoded pagination
 * container: { current_page_number, items_per_page, total_items, items[] }.
 * Throws on network/HTTP errors and when the data island is missing, so the
 * adapter can surface schema_mismatch / unavailable.
 */
export async function aligroSearchRaw(query: string, opts: AligroSearchOpts = {}): Promise<unknown> {
  const url = new URL(BASE + '/recherche');
  url.searchParams.set('q', query);
  if (opts.nextWeek) url.searchParams.set('nextWeek', 'true');
  if (opts.page && opts.page > 1) url.searchParams.set('page', String(opts.page));

  const html = await fetchText(url.toString());
  const m = ISLAND_RX.exec(html);
  if (!m) throw new Error('island_not_found: <articles-pagination> data island missing');
  return JSON.parse(decodeEntities(m[1]));
}

/** Aligro markets (physical cash & carry locations). Real JSON API. */
export async function aligroMarkets(): Promise<unknown> {
  return httpJson(BASE + '/api/markets/', {
    cacheKey: 'aligro:markets',
    cacheMaxAgeMs: 24 * 60 * 60 * 1000,
    init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
  });
}
