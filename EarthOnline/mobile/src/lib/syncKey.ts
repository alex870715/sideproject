import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'earthonline_fog_sync_key';

function randomHex32(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadSyncKey(): Promise<string> {
  let k = await AsyncStorage.getItem(STORAGE_KEY);
  if (!k || k.length < 8) {
    k = randomHex32();
    await AsyncStorage.setItem(STORAGE_KEY, k);
  }
  return k;
}

export async function saveSyncKey(key: string): Promise<void> {
  const t = key.trim();
  if (t.length < 8) throw new Error('同步碼至少 8 字元');
  await AsyncStorage.setItem(STORAGE_KEY, t);
}

export async function regenerateSyncKey(): Promise<string> {
  const k = randomHex32();
  await AsyncStorage.setItem(STORAGE_KEY, k);
  return k;
}
