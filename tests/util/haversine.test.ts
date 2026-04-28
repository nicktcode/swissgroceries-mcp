import { describe, it, expect } from 'vitest';
import { haversineKm } from '../../src/util/haversine.js';

describe('haversineKm', () => {
  it('zero for same point', () => {
    expect(haversineKm({ lat: 47.376, lng: 8.541 }, { lat: 47.376, lng: 8.541 })).toBe(0);
  });

  it('roughly 1.4 km between Zurich HB and Bahnhofstrasse mid', () => {
    const hb = { lat: 47.378, lng: 8.540 };
    const bh = { lat: 47.371, lng: 8.539 };
    const d = haversineKm(hb, bh);
    expect(d).toBeGreaterThan(0.6);
    expect(d).toBeLessThan(1.0);
  });

  it('roughly 220 km between Zurich and Geneva', () => {
    const zrh = { lat: 47.376, lng: 8.541 };
    const gva = { lat: 46.205, lng: 6.143 };
    const d = haversineKm(zrh, gva);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(240);
  });
});
