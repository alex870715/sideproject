import type { PickFoodGameSettings } from '@/types/pickFoodGame';

import { clampPickCount } from '@/features/pick-food/countLimits';
import { FALLBACK_FOOD_OPTIONS, shuffleInPlace } from '@/features/pick-food/options';

export { clampPickCount, PICK_COUNT_MAX, PICK_COUNT_MIN } from '@/features/pick-food/countLimits';

export function parseCustomLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cycleFill(pool: string[], count: number): string[] {
  const base = pool.length > 0 ? pool : [...FALLBACK_FOOD_OPTIONS];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(base[i % base.length]);
  }
  return out;
}

/** Length always === clampPickCount(settings.optionCount). Shuffled order. */
export function buildGameLabels(
  settings: PickFoodGameSettings,
  resolvedRandomPool: string[],
): string[] {
  const count = clampPickCount(settings.optionCount);

  if (settings.sourceMode === 'custom') {
    const lines = parseCustomLines(settings.customText);
    const pool =
      lines.length > 0
        ? lines
        : resolvedRandomPool.length > 0
          ? resolvedRandomPool
          : FALLBACK_FOOD_OPTIONS;
    const seq = cycleFill(pool, count);
    shuffleInPlace(seq);
    return seq;
  }

  const pool =
    resolvedRandomPool.length > 0 ? resolvedRandomPool : FALLBACK_FOOD_OPTIONS;
  const seq = cycleFill(pool, count);
  shuffleInPlace(seq);
  return seq;
}
