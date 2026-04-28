import zipsRaw from '../data/swiss-zips.json' with { type: 'json' };
import type { GeoPoint } from '../adapters/types.js';

type ZipEntry = { city: string; lat: number; lng: number };
const zips = zipsRaw as Record<string, ZipEntry>;

export type GeocodeInput =
  | { lat: number; lng: number }
  | { zip: string }
  | { address: string };

export type GeocodeError =
  | { code: 'unknown_zip'; zip: string }
  | { code: 'address_unsupported'; reason: string };

export type GeocodeResult =
  | { ok: true; data: GeoPoint & { city?: string } }
  | { ok: false; error: GeocodeError };

export function geocode(input: GeocodeInput): GeocodeResult {
  if ('lat' in input) {
    return { ok: true, data: { lat: input.lat, lng: input.lng } };
  }
  if ('zip' in input) {
    const entry = zips[input.zip];
    if (!entry) return { ok: false, error: { code: 'unknown_zip', zip: input.zip } };
    return { ok: true, data: { lat: entry.lat, lng: entry.lng, city: entry.city } };
  }
  return {
    ok: false,
    error: {
      code: 'address_unsupported',
      reason: 'Free-text addresses land in v1.1; pass a ZIP or { lat, lng } instead.',
    },
  };
}
