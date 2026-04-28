import zipsRaw from '../data/swiss-zips.json' with { type: 'json' };
import type { GeoPoint } from '../adapters/types.js';
import { httpJson } from '../util/http.js';

type ZipEntry = { city: string; lat: number; lng: number };
const zips = zipsRaw as Record<string, ZipEntry>;

export type GeocodeInput =
  | { lat: number; lng: number }
  | { zip: string }
  | { address: string };

export type GeocodeError =
  | { code: 'unknown_zip'; zip: string }
  | { code: 'address_not_found'; query: string }
  | { code: 'unavailable'; reason: string }
  | { code: 'address_unsupported'; reason: string };  // kept for back-compat, no longer used

export type GeocodeResult =
  | { ok: true; data: GeoPoint & { city?: string } }
  | { ok: false; error: GeocodeError };

const NOMINATIM_USER_AGENT = 'swissgroceries-mcp/0.1 (+https://github.com/youruser/swissgroceries-mcp)';
const NOMINATIM_CACHE_MS = 30 * 24 * 3600 * 1000; // 30 days

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
}

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const normalized = address.trim().toLowerCase();
  const query = encodeURIComponent(address.trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&countrycodes=ch&format=json&limit=1&addressdetails=1`;

  let results: NominatimResult[];
  try {
    results = await httpJson<NominatimResult[]>(url, {
      cacheKey: `nominatim:${normalized}`,
      cacheMaxAgeMs: NOMINATIM_CACHE_MS,
      rateLimitPerSec: 1,
      retries: 2,
      init: {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      },
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'unavailable', reason } };
  }

  if (!results || results.length === 0) {
    return { ok: false, error: { code: 'address_not_found', query: address } };
  }

  const hit = results[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  const city =
    hit.address?.city ??
    hit.address?.town ??
    hit.address?.village ??
    hit.display_name.split(',')[0].trim();

  return { ok: true, data: { lat, lng, city } };
}

export async function geocode(input: GeocodeInput): Promise<GeocodeResult> {
  if ('lat' in input) {
    return { ok: true, data: { lat: input.lat, lng: input.lng } };
  }
  if ('zip' in input) {
    const entry = zips[input.zip];
    if (!entry) return { ok: false, error: { code: 'unknown_zip', zip: input.zip } };
    return { ok: true, data: { lat: entry.lat, lng: entry.lng, city: entry.city } };
  }
  return geocodeAddress(input.address);
}
