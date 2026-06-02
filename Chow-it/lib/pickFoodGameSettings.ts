import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PickFoodGameSettings } from '@/types/pickFoodGame';
import { clampPickCount } from '@/features/pick-food/countLimits';

const KEY = '@chowit/pick_food_game_settings_v1';

export const DEFAULT_PICK_FOOD_GAME_SETTINGS: PickFoodGameSettings = {
  sourceMode: 'random',
  optionCount: 9,
  customText: '',
};

export async function loadPickFoodGameSettings(): Promise<PickFoodGameSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PICK_FOOD_GAME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PickFoodGameSettings>;
    return {
      sourceMode: parsed.sourceMode === 'custom' ? 'custom' : 'random',
      optionCount: clampPickCount(parsed.optionCount ?? DEFAULT_PICK_FOOD_GAME_SETTINGS.optionCount),
      customText: typeof parsed.customText === 'string' ? parsed.customText : '',
    };
  } catch {
    return DEFAULT_PICK_FOOD_GAME_SETTINGS;
  }
}

export async function savePickFoodGameSettings(s: PickFoodGameSettings): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      ...s,
      optionCount: clampPickCount(s.optionCount),
    }),
  );
}
