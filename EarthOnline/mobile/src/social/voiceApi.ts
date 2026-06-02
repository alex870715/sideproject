import type { SupabaseClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export type VoiceMessageRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
  played_at: string | null;
};

function newMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function sendVoiceMessage(
  sb: SupabaseClient,
  fromUserId: string,
  toUserId: string,
  fileUri: string,
  durationSeconds: number | null,
): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('語音上傳請使用 iOS / Android App。');
  }

  const messageId = newMessageId();
  const storagePath = `${fromUserId}/${messageId}.m4a`;

  const body = await fileUriToArrayBuffer(fileUri);
  const { error: upErr } = await sb.storage
    .from('voice-messages')
    .upload(storagePath, body, {
      contentType: 'audio/m4a',
      upsert: false,
    });
  if (upErr) throw upErr;

  const { error: insErr } = await sb.from('voice_messages').insert({
    id: messageId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    storage_path: storagePath,
    duration_seconds: durationSeconds,
  });
  if (insErr) throw insErr;
}

export async function listIncomingVoice(
  sb: SupabaseClient,
  myId: string,
): Promise<VoiceMessageRow[]> {
  const { data, error } = await sb
    .from('voice_messages')
    .select(
      'id, from_user_id, to_user_id, storage_path, duration_seconds, created_at, played_at',
    )
    .eq('to_user_id', myId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as VoiceMessageRow[];
}

export async function markVoicePlayed(
  sb: SupabaseClient,
  messageId: string,
): Promise<void> {
  const { error } = await sb
    .from('voice_messages')
    .update({ played_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function createVoiceSignedUrl(
  sb: SupabaseClient,
  storagePath: string,
  ttlSec = 600,
): Promise<string> {
  const { data, error } = await sb.storage
    .from('voice-messages')
    .createSignedUrl(storagePath, ttlSec);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('無法建立播放連結');
  return data.signedUrl;
}

export function classifyVoiceUploadError(
  e: unknown,
): 'permission' | 'friends' | 'generic' {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('VOICE_PERMISSION_DENIED')) return 'permission';
  if (msg.includes('VOICE_NOT_FRIENDS')) return 'friends';
  return 'generic';
}

export function mapVoiceUploadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('VOICE_PERMISSION_DENIED')) {
    return '對方尚未允許你傳語音叫醒，請對方在好友列表開啟權限。';
  }
  if (msg.includes('VOICE_NOT_FRIENDS')) {
    return '僅已接受的好友可呼叫語音叫醒。';
  }
  return msg;
}
