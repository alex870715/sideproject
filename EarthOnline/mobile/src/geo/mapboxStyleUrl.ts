/** Mapbox 底圖（均為官方 style；「衛星」為衛星＋路網標籤，才有國名／地名） */
export type MapBaseStyleId = 'satellite' | 'streets' | 'dark' | 'light';

const STYLE_URL: Record<MapBaseStyleId, string> = {
  /** satellite-v9 僅實景、幾無向量標籤；streets-v12 疊加國界／城市文字 */
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
};

export function getMapboxStyleUrl(id: MapBaseStyleId): string {
  return STYLE_URL[id] ?? STYLE_URL.satellite;
}

export const MAP_BASE_STYLE_OPTIONS: MapBaseStyleId[] = [
  'satellite',
  'streets',
  'dark',
  'light',
];
