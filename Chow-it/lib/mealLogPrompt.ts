import type { MealLogEntry } from '@/types/mealLog';

/**
 * Compact lines you can append to an LLM system message so agents remember recent meals.
 * Photos are referenced only implicitly (“含照片紀錄”).
 */
export function mealLogsContextForPrompt(entries: MealLogEntry[], maxLines = 18): string {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const lines = sorted.slice(0, maxLines).map((e) => {
    const photoHint = e.photoUri ? '（含照片紀錄）' : '';
    const note = e.note.trim() ? e.note.trim() : '無文字備註';
    return `- ${e.date}: ${note}${photoHint}`;
  });

  if (lines.length === 0) {
    return '';
  }

  return ['### 使用者近期用餐手記（依日期）', ...lines].join('\n');
}
