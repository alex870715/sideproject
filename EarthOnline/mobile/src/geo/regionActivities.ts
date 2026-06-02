import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { feature, point } from '@turf/helpers';
import type { Feature, Polygon } from 'geojson';
import { VISIT_REVEAL_RADIUS_M, type LatLng } from '../store/gameStore';
import { isLocationLit } from './worldFogPolygon';

export type RegionActivity = {
  id: string;
  /** 揭曉後顯示的名稱 */
  label: string;
  /** ISO 8601 起（含） */
  startsAt: string;
  /** ISO 8601 迄（含） */
  endsAt: string;
  region: Polygon;
};

function asRegionFeature(poly: Polygon): Feature<Polygon> {
  return feature(poly);
}

/** 範例：依時間生效；之後可改從 API 載入 */
export const SAMPLE_REGION_ACTIVITIES: RegionActivity[] = [
  {
    id: 'songkran-bangkok',
    label: '潑水節',
    startsAt: '2026-04-12T17:00:00.000Z',
    endsAt: '2026-04-15T16:59:59.999Z',
    region: {
      type: 'Polygon',
      coordinates: [
        [
          [99.8, 12.8],
          [101.2, 12.8],
          [101.2, 14.2],
          [99.8, 14.2],
          [99.8, 12.8],
        ],
      ],
    },
  },
  {
    id: 'taiwan-spring-demo',
    label: '海線潮市集（春季場）',
    startsAt: '2026-05-01T00:00:00+08:00',
    endsAt: '2026-05-31T23:59:59+08:00',
    region: {
      type: 'Polygon',
      coordinates: [
        [
          [119.2, 21.8],
          [122.2, 21.8],
          [122.2, 25.4],
          [119.2, 25.4],
          [119.2, 21.8],
        ],
      ],
    },
  },
];

function isActivityActive(a: RegionActivity, now: Date): boolean {
  const t = now.getTime();
  return (
    t >= Date.parse(a.startsAt) && t <= Date.parse(a.endsAt)
  );
}

/**
 * 以「目前焦點座標」對應活動區：未踏足該區顯示？？？，踏足後顯示真實活動名（且需在活動時間內）
 */
export function resolveTimedCultureLine(
  focus: LatLng | null,
  visitPins: LatLng[],
  now: Date,
  activities: RegionActivity[],
  revealRadiusM: number = VISIT_REVEAL_RADIUS_M,
): { line: string } | null {
  if (!focus) return null;
  const pt: [number, number] = [focus.longitude, focus.latitude];
  for (const act of activities) {
    if (!isActivityActive(act, now)) continue;
    const rf = asRegionFeature(act.region);
    if (!booleanPointInPolygon(point(pt), rf)) continue;
    /** 焦點必須落在已開霧（圓形聯集）內，才顯示真實活動名 */
    const revealed = isLocationLit(focus, visitPins, revealRadiusM);
    return revealed
      ? { line: `活動進行中：${act.label}` }
      : { line: '活動進行中：？？？' };
  }
  return null;
}
