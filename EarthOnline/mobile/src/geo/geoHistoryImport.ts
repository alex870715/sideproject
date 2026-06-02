import type { LatLng } from '../store/gameStore';

/** 匯入點數上限，避免一次塞爆定時器／記憶體 */
export const MAX_IMPORT_ROUTE_POINTS = 900;

export function downsampleLatLngs(
  points: LatLng[],
  maxPoints: number = MAX_IMPORT_ROUTE_POINTS,
): LatLng[] {
  if (points.length <= maxPoints) return [...points];
  const out: LatLng[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const t = maxPoints <= 1 ? 0 : i / (maxPoints - 1);
    const idx = Math.round(t * (points.length - 1));
    out.push(points[idx]);
  }
  return out;
}

function asLatLng(lat: number, lng: number): LatLng | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

/** Google Takeout「定位記錄」JSON：`{ "locations": [ { latitudeE7, longitudeE7 } ] }` */
export function parseGoogleLocationHistoryJson(
  raw: string,
): LatLng[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const locs = (data as { locations?: unknown }).locations;
  if (Array.isArray(locs) && locs.length > 0) {
    const out: LatLng[] = [];
    for (const row of locs) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const latE7 = r.latitudeE7;
      const lngE7 = r.longitudeE7;
      if (typeof latE7 !== 'number' || typeof lngE7 !== 'number') continue;
      const p = asLatLng(latE7 / 1e7, lngE7 / 1e7);
      if (p) out.push(p);
    }
    return out.length ? downsampleLatLngs(out) : null;
  }

  const timeline = (data as { timelineObjects?: unknown }).timelineObjects;
  if (Array.isArray(timeline) && timeline.length > 0) {
    const out: LatLng[] = [];
    for (const obj of timeline) {
      if (!obj || typeof obj !== 'object') continue;
      const o = obj as Record<string, unknown>;
      const pv = o.placeVisit as Record<string, unknown> | undefined;
      const loc = pv?.location as Record<string, unknown> | undefined;
      if (loc) {
        const latE7 = loc.latitudeE7;
        const lngE7 = loc.longitudeE7;
        if (typeof latE7 === 'number' && typeof lngE7 === 'number') {
          const p = asLatLng(latE7 / 1e7, lngE7 / 1e7);
          if (p) out.push(p);
        }
      }
      const seg = o.activitySegment as Record<string, unknown> | undefined;
      const start = seg?.startLocation as Record<string, unknown> | undefined;
      const end = seg?.endLocation as Record<string, unknown> | undefined;
      for (const x of [start, end]) {
        if (!x) continue;
        const latE7 = x.latitudeE7;
        const lngE7 = x.longitudeE7;
        if (typeof latE7 === 'number' && typeof lngE7 === 'number') {
          const p = asLatLng(latE7 / 1e7, lngE7 / 1e7);
          if (p) out.push(p);
        }
      }
    }
    return out.length ? downsampleLatLngs(out) : null;
  }

  return null;
}

function lineStringCoords(coords: unknown): LatLng[] {
  if (!Array.isArray(coords)) return [];
  const out: LatLng[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    const p = asLatLng(lat, lng);
    if (p) out.push(p);
  }
  return out;
}

function multiLineCoords(coords: unknown): LatLng[] {
  if (!Array.isArray(coords)) return [];
  const out: LatLng[] = [];
  for (const line of coords) {
    out.push(...lineStringCoords(line));
  }
  return out;
}

/** 軌跡 GeoJSON：LineString、MultiLineString，或 Point 组成的 FeatureCollection（依序） */
export function parseRouteGeoJson(raw: string): LatLng[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;
  if (d.type === 'LineString' && d.coordinates) {
    const pts = lineStringCoords(d.coordinates);
    return pts.length ? downsampleLatLngs(pts) : null;
  }
  if (d.type === 'MultiLineString' && d.coordinates) {
    const pts = multiLineCoords(d.coordinates);
    return pts.length ? downsampleLatLngs(pts) : null;
  }
  if (d.type === 'Feature' && d.geometry && typeof d.geometry === 'object') {
    const g = d.geometry as Record<string, unknown>;
    if (g.type === 'LineString' && g.coordinates) {
      const pts = lineStringCoords(g.coordinates);
      return pts.length ? downsampleLatLngs(pts) : null;
    }
    if (g.type === 'MultiLineString' && g.coordinates) {
      const pts = multiLineCoords(g.coordinates);
      return pts.length ? downsampleLatLngs(pts) : null;
    }
  }
  if (d.type === 'FeatureCollection' && Array.isArray(d.features)) {
    const out: LatLng[] = [];
    for (const f of d.features as Record<string, unknown>[]) {
      const g = f?.geometry as Record<string, unknown> | undefined;
      if (!g) continue;
      if (g.type === 'Point' && Array.isArray(g.coordinates)) {
        const lng = Number(g.coordinates[0]);
        const lat = Number(g.coordinates[1]);
        const p = asLatLng(lat, lng);
        if (p) out.push(p);
      }
      if (g.type === 'LineString' && g.coordinates) {
        out.push(...lineStringCoords(g.coordinates));
      }
      if (g.type === 'MultiLineString' && g.coordinates) {
        out.push(...multiLineCoords(g.coordinates));
      }
    }
    return out.length ? downsampleLatLngs(out) : null;
  }

  return null;
}
