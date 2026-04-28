// Run once: npx tsx scripts/build-swiss-zips.ts
// Fetches all Swiss localities from swisstopo (official WGS84 CSV) and writes
// a flat ZIP→{city,lat,lng} map to src/data/swiss-zips.json.
import { writeFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';

// swisstopo official PLZ dataset – WGS84 coordinates, updated quarterly.
// STAC asset: ortschaftenverzeichnis_plz_4326.csv.zip
const CSV_ZIP_URL =
  'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip';

async function fetchAndUnzip(): Promise<string> {
  process.stderr.write('fetching swisstopo WGS84 CSV zip…\n');
  const res = await fetch(CSV_ZIP_URL);
  if (!res.ok) throw new Error(`CSV zip fetch failed: ${res.status}`);

  const zipPath = join(tmpdir(), 'swiss-plz.csv.zip');
  const outDir = join(tmpdir(), 'swiss-plz-csv');

  // Write zip to tmp
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(zipPath, buf);

  // Unzip
  execFileSync('unzip', ['-o', '-d', outDir, zipPath], { stdio: 'ignore' });

  // Find the CSV file
  const csvPath = join(outDir, 'AMTOVZ_CSV_WGS84', 'AMTOVZ_CSV_WGS84.csv');
  if (!existsSync(csvPath)) throw new Error(`CSV not found at ${csvPath}`);
  return csvPath;
}

async function main() {
  const csvPath = await fetchAndUnzip();
  process.stderr.write(`parsing ${csvPath}…\n`);

  // Remove UTF-8 BOM if present, split lines
  let text = readFileSync(csvPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split('\n');

  // Header: Ortschaftsname;PLZ4;Zusatzziffer;ZIP_ID;Gemeindename;BFS-Nr;Kantonskürzel;Adressenanteil;E;N;Sprache;Validity
  const header = lines[0].split(';');
  const idxName = header.indexOf('Ortschaftsname');
  const idxPlz = header.indexOf('PLZ4');
  const idxE = header.indexOf('E');   // longitude (WGS84)
  const idxN = header.indexOf('N');   // latitude (WGS84)

  if (idxName < 0 || idxPlz < 0 || idxE < 0 || idxN < 0) {
    throw new Error(`Unexpected header: ${lines[0]}`);
  }

  const map: Record<string, { city: string; lat: number; lng: number }> = {};

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(';');
    if (cols.length < Math.max(idxName, idxPlz, idxE, idxN) + 1) continue;
    const zip = cols[idxPlz].trim();
    const rawName = cols[idxName].trim();
    const lng = parseFloat(cols[idxE]);
    const lat = parseFloat(cols[idxN]);
    if (!zip || !rawName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // Some entries have a district suffix like "Lausanne 25" — strip the trailing number
    const city = rawName.replace(/\s+\d+$/, '').trim();

    // Keep first-seen entry per ZIP (prefer entries without a trailing digit suffix)
    if (!map[zip]) {
      map[zip] = {
        city,
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
      };
    }
  }

  const count = Object.keys(map).length;
  writeFileSync('src/data/swiss-zips.json', JSON.stringify(map, null, 2));
  console.log(`wrote ${count} ZIP entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
