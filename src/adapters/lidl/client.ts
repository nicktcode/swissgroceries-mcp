import { httpJson } from '../../util/http.js';

const UA = 'LidlSocialInternacional/16.47.15 (com.lidl.eci.lidl.plus; build:1445; iOS 26.3.1) Alamofire/5.10.2';

const HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Brand': 'Apple',
  'App': 'com.lidl.eci.lidl.plus',
  'Operating-System': 'iOS',
  'App-Version': '16.47.15',
  'Accept-Language': 'DE',
  'Accept': '*/*',
};

export async function lidlFetch(
  host: string,
  path: string,
  params?: Record<string, string>,
  noCache = false,
): Promise<any> {
  let urlStr = `https://${host}${path}`;
  if (params && Object.keys(params).length > 0) {
    urlStr += '?' + new URLSearchParams(params).toString();
  }
  return httpJson(urlStr, {
    cacheKey: noCache ? undefined : `lidl:${urlStr}`,
    init: { headers: HEADERS },
  });
}

// lidl.ch web storefront. Its search API (/q/api/search) covers the whole
// online assortment (current + upcoming weekly offers, ~600 items, food and
// non-food) and is localized; /p/api/gridboxes returns the same records by
// ERP number. Needs a browser-style Accept header (bare application/json is
// rejected). Verified live 2026-10-20.
const WEB_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Accept': 'application/json, text/plain, */*',
};

export async function lidlWebFetch(path: string, params: Record<string, string>): Promise<any> {
  const urlStr = `https://www.lidl.ch${path}?${new URLSearchParams(params).toString()}`;
  // Locale/language is part of the query string, so it's part of the cache key.
  return httpJson(urlStr, {
    cacheKey: `lidl:${urlStr}`,
    init: { headers: WEB_HEADERS },
  });
}
