export const PICK_COUNT_MIN = 2;
export const PICK_COUNT_MAX = 12;

export function clampPickCount(n: number): number {
  return Math.min(PICK_COUNT_MAX, Math.max(PICK_COUNT_MIN, Math.round(Number(n)) || PICK_COUNT_MIN));
}
