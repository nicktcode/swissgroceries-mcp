import { httpJson } from '../../util/http.js';
import { logger } from '../../util/log.js';

const BASE = 'https://app-api.denner.ch';
const UA = 'DennerApp/6.1.00 (ch.denner.mobile.Denner; build:20260119.248; iOS 26.3.1) Alamofire/5.10.2';
const APP_ID = 'ch.denner.mobile.Denner';

const ACCEPT_LANGUAGE = 'en-US;q=1.0, de-CH;q=0.9';

export interface DennerClient {
  fetch(path: string, query?: Record<string, string | number | undefined>, noCache?: boolean): Promise<any>;
}

interface SignupResponse { clientId: string }
interface SigninResponse { accessToken: string }

interface JwtClaims { exp: number; cid: string }

function decodeJwtExp(token: string): number {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return (JSON.parse(json) as JwtClaims).exp;
  } catch {
    return 0;
  }
}

/**
 * Anonymous, fully-automated auth flow against app-api.denner.ch.
 *
 * Discovered via reverse engineering the iOS app on first launch:
 *   1. POST /api/auth/m/signup  {"appId": "..."}                 -> {clientId}
 *   2. POST /api/auth/m/signin  {"appId": "...", "clientId": ...} -> {accessToken}
 *
 * The accessToken is a JWT with `sub: ""` (no user identity) and `exp ≈ 1 year`.
 * The clientId is stable for an install; we keep it in memory and rotate the
 * accessToken when it gets close to expiry.
 *
 * Users may also pre-supply DENNER_JWT to short-circuit the flow with a
 * pre-captured token (e.g. for offline testing).
 */
class DennerAuth {
  private clientId: string | null = null;
  private accessToken: string | null = null;
  private tokenExp = 0;
  private inFlight: Promise<string> | null = null;

  constructor(initialJwt?: string) {
    if (initialJwt) {
      this.accessToken = initialJwt;
      this.tokenExp = decodeJwtExp(initialJwt);
    }
  }

  async getToken(): Promise<string> {
    const refreshSkewSec = 60 * 60; // refresh if <1 h left
    const nowSec = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.tokenExp - nowSec > refreshSkewSec) {
      return this.accessToken;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.refresh().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async refresh(): Promise<string> {
    if (!this.clientId) {
      const su = (await httpJson(`${BASE}/api/auth/m/signup`, {
        retries: 2,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Accept': '*/*',
            'Accept-Language': ACCEPT_LANGUAGE,
          },
          body: JSON.stringify({ appId: APP_ID }),
        },
      })) as SignupResponse;
      this.clientId = su.clientId;
      logger.debug(`[denner-auth] signup ok, clientId=${this.clientId}`);
    }
    const si = (await httpJson(`${BASE}/api/auth/m/signin`, {
      retries: 2,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          'Accept': '*/*',
          'Accept-Language': ACCEPT_LANGUAGE,
        },
        body: JSON.stringify({ appId: APP_ID, clientId: this.clientId }),
      },
    })) as SigninResponse;
    this.accessToken = si.accessToken;
    this.tokenExp = decodeJwtExp(si.accessToken);
    logger.debug(`[denner-auth] signin ok, exp=${new Date(this.tokenExp * 1000).toISOString()}`);
    return this.accessToken;
  }

  /** Force re-auth on the next getToken() call (e.g. after a 401). */
  invalidate(): void {
    this.accessToken = null;
    this.tokenExp = 0;
  }
}

const auth = new DennerAuth(process.env.DENNER_JWT || undefined);

export function makeDennerClient(_jwt?: string): DennerClient {
  return {
    async fetch(path, query = {}, noCache = false) {
      const url = new URL(BASE + path);
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
      const doFetch = async () => {
        const token = await auth.getToken();
        return httpJson(url.toString(), {
          cacheKey: noCache ? undefined : `denner:${url.toString()}`,
          init: {
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent': UA,
              'Accept': '*/*',
              'Accept-Language': 'de',
            },
          },
        });
      };
      try {
        return await doFetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/HTTP 401|HTTP 403|auth_expired/i.test(msg)) {
          // Pre-supplied DENNER_JWT may have been wrong/expired; clear and retry once with a fresh sign-in.
          auth.invalidate();
          return doFetch();
        }
        throw e;
      }
    },
  };
}

/** For tests. */
export const _dennerAuthForTests = auth;
