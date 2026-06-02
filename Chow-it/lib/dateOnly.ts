/** Local-calendar helpers — avoid UTC drift when labeling meals by day */

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

export function addDaysYMD(ymd: string, delta: number): string {
  const dt = fromYMD(ymd);
  dt.setDate(dt.getDate() + delta);
  return toYMD(dt);
}

export function formatZhTWLong(ymd: string): string {
  const dt = fromYMD(ymd);
  return dt.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export function isValidYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = fromYMD(s);
  return toYMD(dt) === s;
}

/** Shift calendar month (month is 1–12); returns new `{ year, month }`. */
export function shiftCalendarMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Days in month (month is 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
