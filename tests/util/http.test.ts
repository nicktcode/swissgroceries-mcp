import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpJson, withFetchMeta, _resetHttpState } from '../../src/util/http.js';

// Helper: build a Response-like object that fetch returns
function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

const TEST_URL = 'https://example.test/api/data';

beforeEach(() => {
  _resetHttpState();
  vi.unstubAllGlobals();
});

afterEach(() => {
  _resetHttpState();
  vi.unstubAllGlobals();
});

describe('httpJson — caching', () => {
  it('returns a cached value on the second call without fetching again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ value: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await httpJson(TEST_URL, { cacheKey: 'test:cache' });
    const second = await httpJson(TEST_URL, { cacheKey: 'test:cache' });

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    // fetch should only have been called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache when cacheKey is omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await httpJson(TEST_URL);
    await httpJson(TEST_URL);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('httpJson — _resetHttpState', () => {
  it('clears cache so next call fetches fresh data', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return makeResponse({ n: callCount });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r1 = await httpJson(TEST_URL, { cacheKey: 'test:reset' });
    expect((r1 as any).n).toBe(1);

    _resetHttpState();

    const r2 = await httpJson(TEST_URL, { cacheKey: 'test:reset' });
    expect((r2 as any).n).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('withFetchMeta — fetch freshness', () => {
  it('reports a fresh fetch (fromCache=false) on a cache miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const before = Date.now();
    const { result, meta } = await withFetchMeta(() =>
      httpJson(TEST_URL, { cacheKey: 'meta:miss' }));

    expect(result).toEqual({ value: 1 });
    expect(meta.fromCache).toBe(false);
    expect(meta.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it('reports fromCache=true and the ORIGINAL fetch time on a cache hit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ value: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const miss = await withFetchMeta(() => httpJson(TEST_URL, { cacheKey: 'meta:hit' }));
    const hit = await withFetchMeta(() => httpJson(TEST_URL, { cacheKey: 'meta:hit' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hit.meta.fromCache).toBe(true);
    // The hit must carry the ORIGINAL fetch time, not "now"
    expect(hit.meta.fetchedAt).toBe(miss.meta.fetchedAt);
  });

  it('treats a scope with no httpJson fetch as fresh-now (e.g. the Migros path)', async () => {
    const before = Date.now();
    const { meta } = await withFetchMeta(async () => 'no fetch here');
    expect(meta.fromCache).toBe(false);
    expect(meta.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it('aggregates: oldest fetchedAt wins and fromCache is true only if all hits', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse({ a: 1 }))
      .mockResolvedValueOnce(makeResponse({ b: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    // Prime key A so it becomes a hit; key B will be a fresh miss in the scope.
    const primed = await withFetchMeta(() => httpJson(TEST_URL, { cacheKey: 'meta:agg:a' }));

    const { meta } = await withFetchMeta(async () => {
      await httpJson(TEST_URL, { cacheKey: 'meta:agg:a' }); // hit (old time)
      await httpJson('https://example.test/b', { cacheKey: 'meta:agg:b' }); // miss (new time)
    });

    // Mixed hit+miss → not fully cached
    expect(meta.fromCache).toBe(false);
    // Oldest of the two = the primed key's fetch time
    expect(meta.fetchedAt).toBe(primed.meta.fetchedAt);
  });
});

describe('httpJson — circuit breaker', () => {
  it('opens the circuit after 5 consecutive failures and rejects without calling fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('err', 503));
    vi.stubGlobal('fetch', fetchMock);

    // Each call will fail (5xx → retry 3 times per call → 4 fetches per call)
    // We trip the circuit by recording failures. recordFailure is called once per failed exec.
    // 5 failed calls → circuit opens.
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        httpJson('https://failing.test/x', { retries: 0 }).catch(() => null),
      );
    }
    await Promise.all(promises);

    // 6th call should be rejected immediately with circuit_open error
    await expect(httpJson('https://failing.test/x', { retries: 0 }))
      .rejects.toThrow(/circuit_open/);
  });
});

describe('httpJson — retry on 5xx', () => {
  it('retries on 5xx and succeeds on the last attempt', async () => {
    let attempt = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) return makeResponse('err', 503);
      return makeResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpJson('https://retry.test/x', { retries: 3, backoffMs: 0 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse('not found', 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(httpJson('https://err.test/x', { retries: 3 })).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('httpJson — rate limiting', () => {
  it('enforces minimum interval between calls to the same host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ t: Date.now() }));
    vi.stubGlobal('fetch', fetchMock);

    // 2 req/sec → 500ms between calls
    const t0 = Date.now();
    await httpJson('https://ratelimit.test/1', { rateLimitPerSec: 2, retries: 0 });
    await httpJson('https://ratelimit.test/2', { rateLimitPerSec: 2, retries: 0 });
    const elapsed = Date.now() - t0;

    // Should have waited at least ~450ms (allow jitter)
    expect(elapsed).toBeGreaterThanOrEqual(450);
  });
});
