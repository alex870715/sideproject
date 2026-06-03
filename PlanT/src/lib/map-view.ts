import L from "leaflet";
import { getLeadingSpot } from "@/lib/spot-groups";
import type { SpotDto } from "@/types/trip";

export type MapViewTarget =
  | { mode: "point"; lat: number; lng: number; zoom: number }
  | { mode: "bounds"; bounds: L.LatLngBounds }
  | { mode: "none" };

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function spotsToBounds(spots: SpotDto[]): L.LatLngBounds | null {
  const valid = spots.filter((s) => validCoord(s.latitude, s.longitude));
  if (valid.length === 0) return null;
  return L.latLngBounds(
    valid.map((s) => [s.latitude, s.longitude] as [number, number])
  );
}

/** 依目前選擇的 Day 決定地圖要飛到哪裡 */
export function computeMapViewTarget(
  trunkSpots: SpotDto[],
  sproutSpots: SpotDto[],
  isAllView: boolean
): MapViewTarget {
  const trunk = trunkSpots.filter((s) => validCoord(s.latitude, s.longitude));
  const sprouts = sproutSpots.filter((s) => validCoord(s.latitude, s.longitude));

  if (!isAllView) {
    const first = getLeadingSpot(trunk) ?? getLeadingSpot(sprouts);
    if (!first) return { mode: "none" };
    return {
      mode: "point",
      lat: first.latitude,
      lng: first.longitude,
      zoom: 15,
    };
  }

  const all = [...trunk, ...sprouts];
  if (all.length === 0) return { mode: "none" };
  if (all.length === 1) {
    return {
      mode: "point",
      lat: all[0].latitude,
      lng: all[0].longitude,
      zoom: 12,
    };
  }
  const bounds = spotsToBounds(all);
  if (!bounds) return { mode: "none" };
  return { mode: "bounds", bounds };
}

export function applyMapViewTarget(map: L.Map, target: MapViewTarget): void {
  map.invalidateSize({ animate: false });

  if (target.mode === "none") return;

  if (target.mode === "point") {
    map.setView([target.lat, target.lng], target.zoom, { animate: false });
    return;
  }

  map.fitBounds(target.bounds, {
    padding: [56, 56],
    maxZoom: 14,
    animate: false,
  });
}
