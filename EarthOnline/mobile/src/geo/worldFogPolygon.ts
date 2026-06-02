import buffer from '@turf/buffer';
import bboxPolygon from '@turf/bbox-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import difference from '@turf/difference';
import polygonToLine from '@turf/polygon-to-line';
import { point } from '@turf/helpers';
import union from '@turf/union';
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from 'geojson';
import type { LatLng } from '../store/gameStore';
import countryLandBoundaries from './countryLandBoundaries.json';
import oceanMaskStatic from './oceanMask.json';

const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

type CountryFc = typeof countryLandBoundaries;

/**
 * 地圖覆蓋（由下而上繪製順序）：
 * 1. fogOcean — 海洋迷霧，僅足跡圓挖洞
 * 2. fogLandUnentered — 未曾踏足國家陸地迷霧（遮住國名）
 * 3. dim — 已入境國家、足跡以外的灰暗區
 * 4. revealed + outlines — 足跡圓邊界（著色／描邊目前為透明，僅保留圖層堆疊與資料）
 * 5. events — 活動（由 Map 元件畫在最上層）
 */
export type MapFogPayload = {
  fogOcean: Feature<Polygon | MultiPolygon>;
  fogLandUnentered: FeatureCollection;
  dim: FeatureCollection;
  revealed: FeatureCollection | Feature<Polygon | MultiPolygon>;
  outlines: FeatureCollection;
  events: FeatureCollection;
};

/** 海洋遮罩由 npm run build:ocean-mask 預先寫入，避免在裝置上首次 union 全球陸地。 */
function getOceanPolygon(): Feature<Polygon | MultiPolygon> {
  return oceanMaskStatic as Feature<Polygon | MultiPolygon>;
}

/** 合併所有造訪圓（Zenly 式平滑邊界） */
export function buildFootprintFeature(
  visitPins: LatLng[],
  radiusM: number,
): Feature<Polygon | MultiPolygon> | null {
  if (visitPins.length === 0) return null;
  let acc: Feature<Polygon | MultiPolygon> = buffer(
    point([visitPins[0].longitude, visitPins[0].latitude]),
    radiusM,
    { units: 'meters' },
  ) as Feature<Polygon | MultiPolygon>;
  for (let i = 1; i < visitPins.length; i += 1) {
    const b = buffer(
      point([visitPins[i].longitude, visitPins[i].latitude]),
      radiusM,
      { units: 'meters' },
    ) as Feature<Polygon | MultiPolygon>;
    const u = union(acc, b);
    if (u) acc = u as Feature<Polygon | MultiPolygon>;
  }
  return acc;
}

function outlinesFromFootprint(
  footprint: Feature<Polygon | MultiPolygon>,
): FeatureCollection {
  const line = polygonToLine(footprint);
  if (line.type === 'FeatureCollection') return line;
  return { type: 'FeatureCollection', features: [line] };
}

export function buildFogCoverFromFootprint(
  footprint: Feature<Polygon | MultiPolygon> | null,
): Feature<Polygon | MultiPolygon> {
  const world = bboxPolygon(WORLD_BBOX);
  if (!footprint) return world;
  try {
    const fog = difference(world, footprint);
    if (fog != null) return fog as Feature<Polygon | MultiPolygon>;
  } catch (e) {
    console.warn('[worldFog] difference failed', e);
  }
  return world;
}

function countryContainingPoint(
  lng: number,
  lat: number,
  fc: CountryFc,
): string | null {
  const pt = point([lng, lat]);
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
    try {
      if (booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>)) {
        const code = f.properties?.cca2;
        if (typeof code === 'string' && code.length > 0) return code;
      }
    } catch {
      /* invalid ring */
    }
  }
  return null;
}

/** 曾踏足＝打卡點或目前位置落在該國陸地（不再以「整國挖洞」清霧） */
function collectEnteredCountryCodes(
  visitPins: LatLng[],
  lastKnown: LatLng | null | undefined,
  fc: CountryFc,
): Set<string> {
  const set = new Set<string>();
  for (const p of visitPins) {
    const c = countryContainingPoint(p.longitude, p.latitude, fc);
    if (c) set.add(c);
  }
  if (lastKnown) {
    const c = countryContainingPoint(
      lastKnown.longitude,
      lastKnown.latitude,
      fc,
    );
    if (c) set.add(c);
  }
  return set;
}

/** 某座標是否落在「已開霧」的圓形聯集內（焦點在亮區內才算揭曉） */
export function isLocationLit(
  loc: LatLng,
  visitPins: LatLng[],
  radiusM: number,
): boolean {
  const fp = buildFootprintFeature(visitPins, radiusM);
  if (!fp) return false;
  return booleanPointInPolygon(
    point([loc.longitude, loc.latitude]),
    fp,
  );
}

/** 足跡是否與某區域相交（僅用於其他演算法；揭曉活動請用 isLocationLit + 焦點） */
export function footprintIntersectsRegion(
  visitPins: LatLng[],
  radiusM: number,
  region: Feature<Polygon | MultiPolygon>,
): boolean {
  const fp = buildFootprintFeature(visitPins, radiusM);
  if (!fp) return false;
  return booleanIntersects(fp, region);
}

export function buildMapFogPayload(
  visitPins: LatLng[],
  radiusM: number,
  events: FeatureCollection,
  lastKnown?: LatLng | null,
): MapFogPayload {
  const fc = countryLandBoundaries as CountryFc;
  const entered = collectEnteredCountryCodes(visitPins, lastKnown, fc);
  const footprint = buildFootprintFeature(visitPins, radiusM);

  const fogLandFeatures: Feature<Polygon | MultiPolygon>[] = [];
  for (const f of fc.features) {
    const code = f.properties?.cca2;
    if (typeof code !== 'string' || !code || entered.has(code)) continue;
    fogLandFeatures.push(f as Feature<Polygon | MultiPolygon>);
  }

  const ocean = getOceanPolygon();
  let fogOcean: Feature<Polygon | MultiPolygon> = ocean;
  if (footprint) {
    try {
      const d = difference(ocean, footprint);
      if (d != null) fogOcean = d as Feature<Polygon | MultiPolygon>;
    } catch (e) {
      console.warn('[worldFog] ocean minus footprint failed', e);
    }
  }

  const dimFeatures: Feature<Polygon | MultiPolygon>[] = [];
  for (const code of entered) {
    const feats = fc.features.filter((f) => f.properties?.cca2 === code);
    for (const countryFeat of feats) {
      const typed = countryFeat as Feature<Polygon | MultiPolygon>;
      try {
        if (!footprint) {
          dimFeatures.push(typed);
          continue;
        }
        const d = difference(typed, footprint);
        if (d != null) dimFeatures.push(d as Feature<Polygon | MultiPolygon>);
      } catch (e) {
        console.warn('[worldFog] dim difference failed', code, e);
        dimFeatures.push(typed);
      }
    }
  }

  const revealed: MapFogPayload['revealed'] = footprint
    ? footprint
    : { type: 'FeatureCollection', features: [] };

  const outlines: FeatureCollection = footprint
    ? outlinesFromFootprint(footprint)
    : { type: 'FeatureCollection', features: [] };

  return {
    fogOcean,
    fogLandUnentered: { type: 'FeatureCollection', features: fogLandFeatures },
    dim: { type: 'FeatureCollection', features: dimFeatures },
    revealed,
    outlines,
    events,
  };
}

/** 地圖事件標籤：僅在該圖徵所在處已開霧時顯示真實 title */
export function applyMysteryToMapEvents(
  events: FeatureCollection,
  visitPins: LatLng[],
  radiusM: number,
): FeatureCollection {
  const fp = buildFootprintFeature(visitPins, radiusM);
  return {
    type: 'FeatureCollection',
    features: events.features.map((f) => {
      const raw = (f.properties?.title as string) ?? '？？？';
      let revealed = false;
      if (fp) {
        if (f.geometry.type === 'Point') {
          revealed = booleanPointInPolygon(
            point(f.geometry.coordinates as [number, number]),
            fp,
          );
        } else if (
          f.geometry.type === 'Polygon' ||
          f.geometry.type === 'MultiPolygon'
        ) {
          revealed = booleanIntersects(fp, f as Feature);
        }
      }
      return {
        ...f,
        properties: {
          ...f.properties,
          title: revealed ? raw : '活動進行中：？？？',
        },
      };
    }),
  };
}

export const buildWorldFogPolygon = buildFogCoverFromFootprint;
