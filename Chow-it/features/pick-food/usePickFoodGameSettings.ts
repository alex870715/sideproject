import {
  DEFAULT_PICK_FOOD_GAME_SETTINGS,
  loadPickFoodGameSettings,
  savePickFoodGameSettings,
} from '@/lib/pickFoodGameSettings';
import type { PickFoodGameSettings } from '@/types/pickFoodGame';
import { clampPickCount } from '@/features/pick-food/countLimits';
import { useCallback, useEffect, useState } from 'react';

export function usePickFoodGameSettings() {
  const [settings, setSettings] = useState<PickFoodGameSettings>(DEFAULT_PICK_FOOD_GAME_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadPickFoodGameSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<PickFoodGameSettings>) => {
    setSettings((prev) => {
      const next: PickFoodGameSettings = {
        ...prev,
        ...patch,
        optionCount: clampPickCount(patch.optionCount ?? prev.optionCount),
        sourceMode: patch.sourceMode ?? prev.sourceMode,
        customText: patch.customText !== undefined ? patch.customText : prev.customText,
      };
      savePickFoodGameSettings(next);
      return next;
    });
  }, []);

  return { settings, update, ready };
}
