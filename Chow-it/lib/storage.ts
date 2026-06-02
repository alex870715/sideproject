import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TasteProfile } from '@/types/tasteProfile';

const KEY = '@chowit/taste_profile_v1';

export async function loadTasteProfile(): Promise<TasteProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TasteProfile;
  } catch {
    return null;
  }
}

export async function saveTasteProfile(profile: TasteProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
