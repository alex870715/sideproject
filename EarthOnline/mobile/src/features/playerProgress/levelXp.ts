/** 與 DB `recompute_level`（migration 009）一致：每 1000 XP 一級，上限 99 */
export const XP_PER_LEVEL = 1000;
export const MAX_LEVEL = 99;

export function levelFromXp(xpTotal: number): number {
  if (xpTotal < 0) return 1;
  return Math.min(MAX_LEVEL, Math.max(1, 1 + Math.floor(xpTotal / XP_PER_LEVEL)));
}

/** 當前級距內進度 0–1（滿級回 1） */
export function xpProgressWithinLevel(xpTotal: number): number {
  const lv = levelFromXp(xpTotal);
  if (lv >= MAX_LEVEL) return 1;
  return (xpTotal % XP_PER_LEVEL) / XP_PER_LEVEL;
}

export function xpToReachNextLevel(xpTotal: number): number {
  const lv = levelFromXp(xpTotal);
  if (lv >= MAX_LEVEL) return 0;
  const nextThreshold = lv * XP_PER_LEVEL;
  return Math.max(0, nextThreshold - xpTotal);
}
