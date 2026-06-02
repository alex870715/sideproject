import AsyncStorage from '@react-native-async-storage/async-storage';

import { deleteStoredPhoto } from '@/lib/mealLogPhoto';
import type { MealLogEntry } from '@/types/mealLog';

const KEY = '@chowit/meal_logs_v1';

function sortEntries(list: MealLogEntry[]): MealLogEntry[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function loadMealLogs(): Promise<MealLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MealLogEntry[];
    return Array.isArray(parsed) ? sortEntries(parsed) : [];
  } catch {
    return [];
  }
}

export async function saveMealLogs(entries: MealLogEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sortEntries(entries)));
}

export async function appendMealLog(entry: MealLogEntry): Promise<void> {
  const all = await loadMealLogs();
  await saveMealLogs([entry, ...all]);
}

export async function removeMealLog(id: string): Promise<void> {
  const all = await loadMealLogs();
  const target = all.find((e) => e.id === id);
  if (target?.photoUri) {
    await deleteStoredPhoto(target.photoUri);
  }
  await saveMealLogs(all.filter((e) => e.id !== id));
}

/** Replace entry by id; removes persisted photo file if URI changed or cleared. */
export async function updateMealLog(updated: MealLogEntry): Promise<void> {
  const all = await loadMealLogs();
  const idx = all.findIndex((e) => e.id === updated.id);
  if (idx < 0) return;
  const prev = all[idx];
  if (prev.photoUri && prev.photoUri !== updated.photoUri) {
    await deleteStoredPhoto(prev.photoUri);
  }
  const next = [...all];
  next[idx] = updated;
  await saveMealLogs(next);
}
