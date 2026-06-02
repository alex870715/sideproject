/**
 * 從 countryLandBoundaries.json 在「建置時」算出全球海洋遮罩（世界 bbox − 所有陸地聯集），
 * 避免在手機/Web 上首次載入時同步跑數百次 turf.union 造成 OOM 或「像 crash」的卡死。
 * 請先跑 npm run build:country-land，再跑：npm run build:ocean-mask
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bboxPolygon from '@turf/bbox-polygon';
import difference from '@turf/difference';
import union from '@turf/union';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, '..');
const landPath = path.join(pkgRoot, 'src/geo/countryLandBoundaries.json');
const outPath = path.join(pkgRoot, 'src/geo/oceanMask.json');

const WORLD_BBOX = [-180, -85, 180, 85];

const fc = JSON.parse(fs.readFileSync(landPath, 'utf8'));
let acc = null;
for (const f of fc.features ?? []) {
  if (!f?.geometry) continue;
  if (!acc) {
    acc = f;
    continue;
  }
  const u = union(acc, f);
  if (u) acc = u;
}

if (!acc) {
  console.error('[build-ocean-mask] no land features; check build:country-land');
  process.exit(1);
}

const world = bboxPolygon(WORLD_BBOX);
let ocean;
try {
  ocean = difference(world, acc);
} catch (e) {
  console.error('[build-ocean-mask] difference failed', e);
  process.exit(1);
}

if (ocean == null) {
  console.warn('[build-ocean-mask] difference returned null; using world bbox as ocean');
  ocean = world;
}

fs.writeFileSync(outPath, `${JSON.stringify(ocean)}\n`);
console.log('[build-ocean-mask] wrote', outPath);
