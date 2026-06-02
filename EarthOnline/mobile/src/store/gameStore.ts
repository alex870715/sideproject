import turfDistance from '@turf/distance';
import { point } from '@turf/helpers';
import { create } from 'zustand';

export type LatLng = { latitude: number; longitude: number };

/** 每個造訪點的開霧半徑（公尺），類 Zenly 圓形擴散 */
export const VISIT_REVEAL_RADIUS_M = 420;
/** 兩次打卡距離低於此值視為同點，不重複插針（公尺） */
const MIN_PIN_SPACING_M = 55;

type GameState = {
  lastKnown: LatLng | null;
  /** 圓形開霧的圓心序列 */
  visitPins: LatLng[];
  setLocation: (p: LatLng) => void;
  visitLocation: (p: LatLng) => void;
  clearUnlocked: () => void;
  resetExploration: () => void;
  replaceVisitPins: (pins: LatLng[]) => void;
};

function spacingM(a: LatLng, b: LatLng): number {
  return turfDistance(
    point([a.longitude, a.latitude]),
    point([b.longitude, b.latitude]),
    { units: 'meters' },
  );
}

export const useGameStore = create<GameState>((set, get) => ({
  lastKnown: null,
  visitPins: [],
  setLocation: (p) => set({ lastKnown: p }),
  visitLocation: (p) =>
    set((state) => {
      const dup = state.visitPins.some(
        (q) => spacingM(p, q) < MIN_PIN_SPACING_M,
      );
      if (dup) {
        return { lastKnown: p };
      }
      return { lastKnown: p, visitPins: [...state.visitPins, p] };
    }),
  clearUnlocked: () => set({ visitPins: [] }),
  resetExploration: () => set({ visitPins: [], lastKnown: null }),
  replaceVisitPins: (pins) => set({ visitPins: [...pins] }),
}));
