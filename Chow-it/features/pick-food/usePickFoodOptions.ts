import { loadTasteProfile } from '@/lib/storage';
import { FALLBACK_FOOD_OPTIONS, resolvePickFoodOptions } from '@/features/pick-food/options';
import { useEffect, useState } from 'react';

export function usePickFoodOptions(): string[] {
  const [options, setOptions] = useState<string[]>(FALLBACK_FOOD_OPTIONS);

  useEffect(() => {
    loadTasteProfile().then((p) => {
      setOptions(resolvePickFoodOptions(p));
    });
  }, []);

  return options;
}
