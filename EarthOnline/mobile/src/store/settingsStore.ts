import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MapBaseStyleId } from '../geo/mapboxStyleUrl';

type SettingsState = {
  mapBaseStyle: MapBaseStyleId;
  setMapBaseStyle: (s: MapBaseStyleId) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mapBaseStyle: 'satellite',
      setMapBaseStyle: (mapBaseStyle) => set({ mapBaseStyle }),
    }),
    {
      name: 'earth-online-settings-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mapBaseStyle: s.mapBaseStyle }),
    },
  ),
);
