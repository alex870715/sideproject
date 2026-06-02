import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const DIR = 'meal-photos';

async function ensureDir(): Promise<string | null> {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  const dir = `${base}${DIR}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/** Persist picker URI under app documents; returns final URI or original if unavailable (e.g. web fallback). */
export async function persistPickedImage(sourceUri: string, entryId: string): Promise<string> {
  if (Platform.OS === 'web') {
    return sourceUri;
  }

  const dir = await ensureDir();
  if (!dir) return sourceUri;

  const rawExt =
    sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() ??
    sourceUri.split('/').pop()?.split('?')[0]?.split('.').pop()?.toLowerCase();
  const suffix =
    rawExt && ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(rawExt)
      ? rawExt.replace('jpeg', 'jpg')
      : 'jpg';

  const dest = `${dir}${entryId}.${suffix}`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri;
  }
}

export async function deleteStoredPhoto(uri: string | null): Promise<void> {
  if (!uri || Platform.OS === 'web') return;
  const base = FileSystem.documentDirectory;
  if (!base || !uri.startsWith(base)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}
