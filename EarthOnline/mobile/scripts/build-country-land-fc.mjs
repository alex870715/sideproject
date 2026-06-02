/**
 * 合併 world-countries 各國邊界為單一 GeoJSON，並簡化節點以控制體積。
 * 執行：npm run build:country-land
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import simplify from '@turf/simplify';

const require = createRequire(import.meta.url);
const countries = require('world-countries/countries.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, '..');
const dataDir = path.join(pkgRoot, 'node_modules/world-countries/data');
const outPath = path.join(pkgRoot, 'src/geo/countryLandBoundaries.json');

/** 約 0.012° ≈ 1.3 km；可再調大以縮檔 */
const TOLERANCE = 0.012;

const features = [];
for (const c of countries) {
  const geoPath = path.join(dataDir, `${c.cca3.toLowerCase()}.geo.json`);
  const raw = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
  for (const f of raw.features ?? []) {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const feat = {
      type: 'Feature',
      properties: { cca2: c.cca2 },
      geometry: g,
    };
    try {
      features.push(
        simplify(feat, { tolerance: TOLERANCE, highQuality: false }),
      );
    } catch {
      features.push(feat);
    }
  }
}

const fc = { type: 'FeatureCollection', features };
fs.writeFileSync(outPath, `${JSON.stringify(fc)}\n`, 'utf8');
console.log(
  'Wrote',
  outPath,
  'features:',
  features.length,
  'bytes:',
  fs.statSync(outPath).size,
);
