import { logger } from './log.js';

export interface HttpOpts {
  // Cache key. If omitted, no caching.
  cacheKey?: string;
  // Max age in milliseconds. Default 5 minutes.
  cacheMaxAgeMs?: number;
  // Retry up to N times on 5xx/network errors. Default 3.
  retries?: number;
  // Initial backoff in ms; exponential. Default 250.
  backoffMs?: number;
  // Per-host throttle. Default ~10 req/sec.
  rateLimitPerSec?: number;
  // Standard fetch init.
  init?: RequestInit;
}

interface CacheEntry { value: unknown; expires: number; }
const cache = new Map<string, CacheEntry>();
const cacheDisabled = process.env.SWISSGROCERIES_DISABLE_CACHE === '1';

interface CircuitState { failures: number; openedAt: number | null; }
const circuits = new Map<string, CircuitState>();
const CIRCUIT_OPEN_MS = 60_000;
const CIRCUIT_FAILURE_THRESHOLD = 5;

const lastCallByHost = new Map<string, number>();
const inFlightByHost = new Map<string, Promise<unknown>>();

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return 'unknown'; }
}

async function throttle(host: string, ratePerSec: number): Promise<void> {
  const minIntervalMs = 1000 / ratePerSec;
  const last = lastCallByHost.get(host) ?? 0;
  const wait = Math.max(0, last + minIntervalMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallByHost.set(host, Date.now());
}

function circuitFor(host: string): CircuitState {
  let c = circuits.get(host);
  if (!c) { c = { failures: 0, openedAt: null }; circuits.set(host, c); }
  return c;
}

function circuitOpen(host: string): boolean {
  const c = circuitFor(host);
  if (c.openedAt === null) return false;
  if (Date.now() - c.openedAt > CIRCUIT_OPEN_MS) {
    // Half-open: reset and try again
    c.failures = 0; c.openedAt = null;
    return false;
  }
  return true;
}

function recordFailure(host: string): void {
  const c = circuitFor(host);
  c.failures++;
  if (c.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    c.openedAt = Date.now();
    logger.debug(`[circuit] opened for ${host} after ${c.failures} failures`);
  }
}

function recordSuccess(host: string): void {
  const c = circuitFor(host);
  c.failures = 0;
  c.openedAt = null;
}

/**
 * Fetch JSON with caching, retry, throttling, and per-host circuit breaker.
 */
export async function httpJson<T = unknown>(url: string, opts: HttpOpts = {}): Promise<T> {
  const host = hostOf(url);
  if (circuitOpen(host)) {
    throw new Error(`circuit_open: ${host} is unhealthy; cooling down`);
  }

  const cacheKey = opts.cacheKey;
  const cacheMaxAge = opts.cacheMaxAgeMs ?? 5 * 60 * 1000;

  if (!cacheDisabled && cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      logger.debug(`[cache HIT] ${cacheKey}`);
      return hit.value as T;
    }
    // Coalesce concurrent calls to the same key
    const inFlight = inFlightByHost.get(cacheKey);
    if (inFlight) return inFlight as Promise<T>;
  }

  const exec = (async (): Promise<T> => {
    const retries = opts.retries ?? 3;
    const backoff = opts.backoffMs ?? 250;
    const rate = opts.rateLimitPerSec ?? 10;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await throttle(host, rate);
        const res = await fetch(url, opts.init);
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) {
          // 4xx: don't retry, surface to caller
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const json = (await res.json()) as T;
        recordSuccess(host);
        if (!cacheDisabled && cacheKey) {
          cache.set(cacheKey, { value: json, expires: Date.now() + cacheMaxAge });
        }
        return json;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/HTTP 4\d\d/.test(msg)) throw e; // permanent client error
        if (attempt < retries) {
          const wait = backoff * Math.pow(2, attempt);
          logger.debug(`[retry ${attempt + 1}/${retries}] ${url}: ${msg} (waiting ${wait}ms)`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    recordFailure(host);
    throw lastErr;
  })();

  if (!cacheDisabled && cacheKey) {
    inFlightByHost.set(cacheKey, exec as Promise<unknown>);
    exec.finally(() => inFlightByHost.delete(cacheKey));
  }

  return exec;
}

/** Reset all caches and circuits. Useful for tests. */
export function _resetHttpState(): void {
  cache.clear();
  circuits.clear();
  lastCallByHost.clear();
  inFlightByHost.clear();
}
