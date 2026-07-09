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

// The public web storefront exposes a JSON product-search API distinct from the
// lidlplus.com leaflet API used above. It carries the full catalogue (not just
// the weekly flyer) and is localized by the `locale` query param — de_CH / fr_CH
// / it_CH. Two quirks, both verified against the live endpoint:
//   - `Accept: application/json` alone returns 406; it needs the browser's
//     `application/json, text/plain, */*`.
//   - The HTML storefront page (/{locale}/) can 404 on a cold SSR/edge cache,
//     but this JSON search API answered 200 for all three locales in testing —
//     so a 404 here is treated as a genuine error, not a transient to swallow.
const WEB_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36';

export type LidlLocale = 'de_CH' | 'fr_CH' | 'it_CH';

// Lidl CH ships three storefront locales. Map the request language onto them;
// anything without a Swiss locale (notably 'en') falls back to German, the
// canton-agnostic default the site itself serves when no locale is negotiated.
export function localeForLanguage(language?: 'de' | 'fr' | 'it' | 'en'): LidlLocale {
  return language === 'fr' ? 'fr_CH' : language === 'it' ? 'it_CH' : 'de_CH';
}

export async function lidlSearchFetch(locale: LidlLocale, query: string): Promise<any> {
  const url =
    'https://www.lidl.ch/q/api/search?' +
    new URLSearchParams({
      assortment: 'CH',
      locale,
      version: 'v2.0.0',
      q: query,
      sort: 'relevancy',
    }).toString();
  return httpJson(url, {
    // Locale is part of the cache key so a French request can't be served a
    // cached German response.
    cacheKey: `lidl:search:${locale}:${query.toLowerCase()}`,
    init: {
      headers: {
        'User-Agent': WEB_UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': locale.replace('_', '-'),
      },
    },
  });
}
