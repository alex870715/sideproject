import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import type { FeatureCollection } from 'geojson';
import type { MapFitCommand } from '../geo/gameMapRegions';
import type { MapBaseStyleId } from '../geo/mapboxStyleUrl';
import type { LatLng } from '../store/gameStore';

export type GlobeFogMapProps = {
  mapboxToken?: string;
  visitPins: LatLng[];
  /** 目前／焦點座標；入境時可清除該國迷霧（即使尚未打卡） */
  lastKnown?: LatLng | null;
  visitRadiusM: number;
  eventFeatures?: FeatureCollection;
  height: number;
  /** 球體或 2D Mercator */
  projection?: 'globe' | 'mercator';
  /** 遊戲式攝影機（世界 / 洲界 / 國家） */
  mapFit?: MapFitCommand;
  /** 衛星或向量底圖 */
  baseStyle?: MapBaseStyleId;
  missingTokenMessage?: string;
};

const GlobeFogMap: ComponentType<GlobeFogMapProps> = Platform.select({
  web: require('./GlobeFogMap.web').default,
  default: require('./GlobeFogMap.native').default,
}) as ComponentType<GlobeFogMapProps>;

export default GlobeFogMap;
