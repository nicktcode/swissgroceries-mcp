import { describe, it, expect } from 'vitest';
import { geocode } from '../../src/services/geocoding.js';

describe('geocode', () => {
  it('resolves a known ZIP to lat/lng', () => {
    const r = geocode({ zip: '8001' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lat).toBeCloseTo(47.37, 1);
      expect(r.data.lng).toBeCloseTo(8.54, 1);
    }
  });

  it('returns error for unknown ZIP', () => {
    const r = geocode({ zip: '9999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_zip');
  });

  it('passes through lat/lng inputs unchanged', () => {
    const r = geocode({ lat: 47.0, lng: 8.0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ lat: 47.0, lng: 8.0 });
  });

  it('returns error for address-string input (deferred to v1.1)', () => {
    const r = geocode({ address: 'Bahnhofstrasse 1, Zürich' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('address_unsupported');
  });
});
