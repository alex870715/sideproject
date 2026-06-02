/**
 * Row lengths for “口味抽抽樂” board (top → bottom).
 * e.g. 5 → [3,2], 4 → [2,2], 3 → [3]
 */
export function lotteryRowPattern(count: number): number[] {
  const n = Math.max(1, Math.round(count));
  const presets: Record<number, number[]> = {
    1: [1],
    2: [2],
    3: [3],
    4: [2, 2],
    5: [3, 2],
    6: [3, 3],
    7: [3, 2, 2],
    8: [3, 3, 2],
    9: [3, 3, 3],
    10: [4, 3, 3],
    11: [4, 4, 3],
    12: [4, 4, 4],
  };
  if (presets[n]) return presets[n];

  const rows: number[] = [];
  let remaining = n;
  const targetCols = Math.ceil(Math.sqrt(n));
  while (remaining > 0) {
    const take = Math.min(targetCols, remaining);
    rows.push(take);
    remaining -= take;
  }
  return rows;
}

export function lotteryMaxCols(pattern: number[]): number {
  return pattern.reduce((m, x) => Math.max(m, x), 1);
}
