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
