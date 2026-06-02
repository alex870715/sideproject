import type { LatLng } from '../store/gameStore';

function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * 在相鄰控制點之間線性內插；`subdivisionsPerEdge` 為每段邊的分段數（不含終點重複，最後會補上終點）。
 */
export function densifyPolyline(
  ring: LatLng[],
  subdivisionsPerEdge: number,
): LatLng[] {
  if (ring.length < 2) return [...ring];
  const n = Math.max(2, Math.floor(subdivisionsPerEdge));
  const out: LatLng[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    for (let j = 0; j < n; j += 1) {
      out.push(lerpLatLng(a, b, j / n));
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

/**
 * 測試用：台一線（台1）西濱廊帶由北而南，經屏東後銜接花東、宜蘭海岸回北部成環。
 * 座標為粗略路廊，非精確車道。
 */
const TAIWAN_HW1_SPARSE: LatLng[] = [
  { latitude: 25.128, longitude: 121.741 },
  { latitude: 25.06, longitude: 121.62 },
  { latitude: 25.034, longitude: 121.564 },
  { latitude: 24.993, longitude: 121.301 },
  { latitude: 24.806, longitude: 120.968 },
  { latitude: 24.56, longitude: 120.82 },
  { latitude: 24.162, longitude: 120.647 },
  { latitude: 24.052, longitude: 120.516 },
  { latitude: 23.709, longitude: 120.431 },
  { latitude: 23.451, longitude: 120.255 },
  { latitude: 22.999, longitude: 120.227 },
  { latitude: 22.627, longitude: 120.301 },
  { latitude: 22.18, longitude: 120.48 },
  { latitude: 21.98, longitude: 120.82 },
  { latitude: 22.2, longitude: 121.02 },
  { latitude: 22.761, longitude: 121.144 },
  { latitude: 23.45, longitude: 121.38 },
  { latitude: 23.973, longitude: 121.601 },
  { latitude: 24.45, longitude: 121.75 },
  { latitude: 24.596, longitude: 121.851 },
  { latitude: 24.85, longitude: 121.7 },
  { latitude: 25.08, longitude: 121.45 },
  { latitude: 25.128, longitude: 121.741 },
];

/** 每邊內插 8 段，約 180+ 個打卡點 */
export const DEMO_TAIWAN_HW1_LOOP = densifyPolyline(TAIWAN_HW1_SPARSE, 8);

const TPE: LatLng = { latitude: 25.077, longitude: 121.233 };
const BKK: LatLng = { latitude: 13.681, longitude: 100.747 };

/**
 * 測試用：桃園直飛曼谷廊帶（線性插值，非大圓；中間經南海、中南半島上空示意）。
 * `stepsPerSegment` 愈大點愈密（兩段：TPE↔轉折↔BKK）。
 */
export function buildTpeToThailandDemoRoute(stepsPerSegment = 36): LatLng[] {
  const VietnamDetour: LatLng = { latitude: 10.82, longitude: 106.65 };
  const leg1 = densifyPolyline([TPE, VietnamDetour], stepsPerSegment);
  const leg2 = densifyPolyline([VietnamDetour, BKK], stepsPerSegment);
  return [...leg1.slice(0, -1), ...leg2];
}
