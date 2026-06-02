/** YYYY-MM-DD for <input type="date" /> */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDefaultTripDateRange(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export function validateTripDateRange(
  start: string,
  end: string
): string | null {
  if (!start || !end) return "請選擇出發與回程日期";
  const startMs = parseDateInput(start).getTime();
  const endMs = parseDateInput(end).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return "日期格式無效";
  if (endMs < startMs) return "回程日不可早於出發日";
  return null;
}

export function parseDateInput(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function tripRangeToIso(start: string, end: string): {
  startDate: string;
  endDate: string;
} {
  const startDate = parseDateInput(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = parseDateInput(end);
  endDate.setHours(23, 59, 59, 999);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/** Inclusive calendar days between start and end (local midnight). */
export function tripDayCount(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.max(
    1,
    Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  );
}
