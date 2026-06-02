import type { LatLng } from '../store/gameStore';
import { getSupabase } from '../lib/supabase';

export type VisitedPointDto = { lat: number; lng: number };

function dtoToLatLng(rows: unknown): LatLng[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (x): x is VisitedPointDto =>
        typeof x === 'object' &&
        x != null &&
        'lat' in x &&
        'lng' in x &&
        typeof (x as VisitedPointDto).lat === 'number' &&
        typeof (x as VisitedPointDto).lng === 'number',
    )
    .map((x) => ({ latitude: x.lat, longitude: x.lng }));
}

export async function pullPlayerFog(
  syncKey: string,
): Promise<LatLng[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('player_fog')
    .select('visited_points')
    .eq('sync_key', syncKey)
    .maybeSingle();

  if (error) {
    console.warn('[fogRemote] pull', error.message);
    return null;
  }
  if (!data) return [];
  return dtoToLatLng(data.visited_points);
}

export async function pushPlayerFog(
  syncKey: string,
  pins: LatLng[],
  last: LatLng | null,
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const visited_points: VisitedPointDto[] = pins.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
  }));
  const { error } = await sb.from('player_fog').upsert(
    {
      sync_key: syncKey,
      visited_points,
      last_lat: last?.latitude ?? null,
      last_lng: last?.longitude ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sync_key' },
  );

  if (error) {
    console.warn('[fogRemote] push', error.message);
    return false;
  }
  return true;
}
