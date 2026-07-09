import zipsRaw from '../../data/swiss-zips.json' with { type: 'json' };
import type { NormalizedStore } from '../types.js';

type ZipEntry = { city: string; lat: number; lng: number };
const zips = zipsRaw as Record<string, ZipEntry>;

/**
 * Aligro's physical cash & carry network (Groupe Demaurex). Aligro exposes no
 * store API carrying geo — its /marches page lists a small, fixed set of
 * markets with a postal address each. That list is captured here as static
 * reference data; coordinates are resolved from the bundled Swiss ZIP dataset
 * (same source as the geocoding service). ZIP-centroid coordinates are accurate
 * enough to rank the nearest Aligro market, since no two markets share a town.
 *
 * Refresh: re-read https://www.aligro.ch/marches if a market is added/removed.
 */
export interface AligroMarket {
  id: number;
  name: string;
  street: string;
  zip: string;
  city: string;
}

export const ALIGRO_MARKETS: AligroMarket[] = [
  { id: 1, name: 'Chavannes', street: 'Avenue de la Concorde 6', zip: '1022', city: 'Chavannes-près-Renens' },
  { id: 3, name: 'Genève', street: 'Rue François-Dussaud 15', zip: '1227', city: 'Genève - Acacias' },
  { id: 2, name: 'Matran', street: 'Chemin de la Cornache 1', zip: '1753', city: 'Matran' },
  { id: 4, name: 'Sion', street: 'Route des Ronquos 100', zip: '1950', city: 'Sion' },
  { id: 10, name: 'Bern', street: 'Murtenstrasse 121', zip: '3008', city: 'Bern' },
  { id: 11, name: 'Brüttisellen', street: 'Ruchstuckstrasse 3', zip: '8306', city: 'Brüttisellen' },
  { id: 13, name: 'Emmen', street: 'Buholzstrasse 3', zip: '6032', city: 'Emmen' },
  { id: 7, name: 'Frauenfeld', street: 'Neuhofstrasse 8', zip: '8500', city: 'Frauenfeld' },
  { id: 6, name: 'Gossau SG', street: 'Mooswiesstrasse 42', zip: '9200', city: 'Gossau SG' },
  { id: 12, name: 'Pratteln', street: 'Dürrenhübelstrasse 6', zip: '4133', city: 'Pratteln' },
  { id: 8, name: 'Rapperswil-Jona', street: 'Rütistrasse 155', zip: '8645', city: 'Jona' },
  { id: 9, name: 'Sargans', street: 'Bahnhofstrasse 58', zip: '7323', city: 'Wangs' },
  { id: 5, name: 'Schlieren', street: 'Bernerstrasse 335', zip: '8952', city: 'Schlieren' },
  { id: 14, name: 'Spreitenbach', street: 'Industriestrasse 167', zip: '8957', city: 'Spreitenbach' },
];

/**
 * The market network as geolocated NormalizedStores. A market whose ZIP does
 * not resolve to a coordinate is omitted rather than returned with a bogus
 * location — a geo store search must not point at (0, 0). All markets resolve
 * today; a regression there is caught by the adapter tests.
 */
export const ALIGRO_STORES: NormalizedStore[] = ALIGRO_MARKETS.flatMap((m) => {
  const geo = zips[m.zip];
  if (!geo) return [];
  return [{
    chain: 'aligro' as const,
    id: String(m.id),
    name: `ALIGRO ${m.name}`,
    address: { street: m.street, zip: m.zip, city: m.city },
    location: { lat: geo.lat, lng: geo.lng },
  }];
});
