import { describe, it, expect, beforeEach, vi } from 'vitest';
import { geocode } from '../../src/services/geocoding.js';
import { _resetHttpState } from '../../src/util/http.js';

beforeEach(() => {
  _resetHttpState();
  vi.restoreAllMocks();
});

describe('geocode', () => {
  it('resolves a known ZIP to lat/lng', async () => {
    const r = await geocode({ zip: '8001' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lat).toBeCloseTo(47.37, 1);
      expect(r.data.lng).toBeCloseTo(8.54, 1);
    }
  });

  it('returns error for unknown ZIP', async () => {
    const r = await geocode({ zip: '9999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_zip');
  });

  it('passes through lat/lng inputs unchanged', async () => {
    const r = await geocode({ lat: 47.0, lng: 8.0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ lat: 47.0, lng: 8.0 });
  });

  describe('address path', () => {
    it('returns geocoded coordinates for a valid address', async () => {
      const mockResponse = [
        {
          lat: '47.3769',
          lon: '8.5417',
          display_name: 'Bahnhofstrasse, 8001 Zürich, Switzerland',
          address: { city: 'Zürich', postcode: '8001' },
        },
      ];
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const r = await geocode({ address: 'Bahnhofstrasse 1' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.lat).toBeCloseTo(47.3769, 4);
        expect(r.data.lng).toBeCloseTo(8.5417, 4);
        expect(r.data.city).toBe('Zürich');
      }
    });

    it('returns address_not_found when Nominatim returns empty array', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const r = await geocode({ address: 'Nonexistent Street 9999' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('address_not_found');
        expect((r.error as any).query).toBe('Nonexistent Street 9999');
      }
    });

    it('returns cached result on second call (fetch called only once)', async () => {
      const mockResponse = [
        {
          lat: '47.3769',
          lon: '8.5417',
          display_name: 'Bahnhofstrasse, 8001 Zürich, Switzerland',
          address: { city: 'Zürich', postcode: '8001' },
        },
      ];
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      await geocode({ address: 'Bahnhofstrasse 1' });
      await geocode({ address: 'Bahnhofstrasse 1' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns unavailable error when httpJson throws', async () => {
      // Mock httpJson at the module level to avoid retry/timer issues
      const httpMod = await import('../../src/util/http.js');
      const httpSpy = vi.spyOn(httpMod, 'httpJson').mockRejectedValueOnce(new Error('network error'));

      const r = await geocode({ address: 'Some Street 1' });
      httpSpy.mockRestore();

      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('unavailable');
      }
    });
  });
});
