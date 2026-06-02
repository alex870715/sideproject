import type { SupabaseClient } from '@supabase/supabase-js';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
};

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

export type FriendListItem = {
  friendship: FriendshipRow;
  other: PublicProfile;
  isIncoming: boolean;
};

async function loadProfiles(
  sb: SupabaseClient,
  ids: string[],
): Promise<Map<string, PublicProfile>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, PublicProfile>();
  if (uniq.length === 0) return map;

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name')
    .in('id', uniq);
  if (error) throw error;
  for (const p of data ?? []) {
    map.set(p.id, p as PublicProfile);
  }
  return map;
}

export async function searchProfilesByUsername(
  sb: SupabaseClient,
  query: string,
  excludeUserId: string,
): Promise<PublicProfile[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name')
    .ilike('username', `${q}%`)
    .neq('id', excludeUserId)
    .limit(25);
  if (error) throw error;
  return (data ?? []) as PublicProfile[];
}

export async function fetchFriendshipsWithProfiles(
  sb: SupabaseClient,
  myId: string,
): Promise<FriendListItem[]> {
  const { data, error } = await sb
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
  if (error) throw error;

  const rows = (data ?? []) as FriendshipRow[];
  const others = rows.map((r) =>
    r.requester_id === myId ? r.addressee_id : r.requester_id,
  );
  const profs = await loadProfiles(sb, others);

  return rows.map((r) => {
    const oid = r.requester_id === myId ? r.addressee_id : r.requester_id;
    const other = profs.get(oid);
    if (!other) {
      return {
        friendship: r,
        other: {
          id: oid,
          username: oid.slice(0, 8),
          display_name: null,
        },
        isIncoming: r.addressee_id === myId && r.status === 'pending',
      };
    }
    return {
      friendship: r,
      other,
      isIncoming: r.addressee_id === myId && r.status === 'pending',
    };
  });
}

export async function sendFriendRequest(
  sb: SupabaseClient,
  myId: string,
  addresseeId: string,
): Promise<void> {
  const { error } = await sb.from('friendships').insert({
    requester_id: myId,
    addressee_id: addresseeId,
    status: 'pending',
  });
  if (error) throw error;
}

export async function acceptFriendRequest(
  sb: SupabaseClient,
  friendshipId: string,
  myId: string,
): Promise<void> {
  const { error } = await sb
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .eq('addressee_id', myId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function deleteFriendship(
  sb: SupabaseClient,
  friendshipId: string,
): Promise<void> {
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function getVoicePermission(
  sb: SupabaseClient,
  ownerId: string,
  peerId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from('friend_voice_permissions')
    .select('allow_incoming_voice')
    .eq('owner_id', ownerId)
    .eq('peer_id', peerId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.allow_incoming_voice);
}

export async function setVoicePermission(
  sb: SupabaseClient,
  ownerId: string,
  peerId: string,
  allow: boolean,
): Promise<void> {
  const { error } = await sb.from('friend_voice_permissions').upsert(
    {
      owner_id: ownerId,
      peer_id: peerId,
      allow_incoming_voice: allow,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id,peer_id' },
  );
  if (error) throw error;
}
