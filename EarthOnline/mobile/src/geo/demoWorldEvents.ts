import type { FeatureCollection } from 'geojson';

/**
 * 演示用「世界動態」圖層：你的遊戲可改為 API / Supabase 即時寫入。
 * 底圖是 Mapbox，上面的點、線、面都是你自己的 GeoJSON，可任意加。
 */
export const DEMO_WORLD_EVENTS: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        title: '活動進行中：潑水節（演示）',
        kind: 'festival',
      },
      geometry: { type: 'Point', coordinates: [100.5018, 13.7563] },
    },
    {
      type: 'Feature',
      properties: {
        title: '高風險區（遊戲演示，非真實戰況）',
        kind: 'danger_zone',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [52.0, 24.0],
            [58.0, 24.0],
            [58.0, 30.0],
            [52.0, 30.0],
            [52.0, 24.0],
          ],
        ],
      },
    },
  ],
};

export const EMPTY_EVENT_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
