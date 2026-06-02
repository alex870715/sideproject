import { useFocusEffect } from '@react-navigation/native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthSession } from '../hooks/useAuthSession';
import {
  acceptFriendRequest,
  deleteFriendship,
  fetchFriendshipsWithProfiles,
  searchProfilesByUsername,
  sendFriendRequest,
  setVoicePermission,
  type FriendListItem,
  type PublicProfile,
} from '../social/friendsApi';
import {
  classifyVoiceUploadError,
  createVoiceSignedUrl,
  listIncomingVoice,
  markVoicePlayed,
  sendVoiceMessage,
  type VoiceMessageRow,
} from '../social/voiceApi';

type PermMaps = {
  iAllowThem: Map<string, boolean>;
  theyAllowMe: Map<string, boolean>;
};

async function loadVoicePermissionMaps(
  sb: SupabaseClient,
  myId: string,
  friendIds: string[],
): Promise<PermMaps> {
  const ids = [...new Set(friendIds)].filter(Boolean);
  const iAllowThem = new Map<string, boolean>();
  const theyAllowMe = new Map<string, boolean>();
  if (ids.length === 0) return { iAllowThem, theyAllowMe };

  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    sb
      .from('friend_voice_permissions')
      .select('peer_id, allow_incoming_voice')
      .eq('owner_id', myId)
      .in('peer_id', ids),
    sb
      .from('friend_voice_permissions')
      .select('owner_id, allow_incoming_voice')
      .eq('peer_id', myId)
      .in('owner_id', ids),
  ]);

  for (const r of outgoing ?? []) {
    iAllowThem.set(r.peer_id as string, Boolean(r.allow_incoming_voice));
  }
  for (const r of incoming ?? []) {
    theyAllowMe.set(r.owner_id as string, Boolean(r.allow_incoming_voice));
  }

  return { iAllowThem, theyAllowMe };
}

export function FriendsScreen() {
  const { t } = useTranslation();
  const { session, supabase } = useAuthSession();
  const uid = session?.user.id;

  const [myProfile, setMyProfile] = useState<{
    username: string;
    display_name: string | null;
  } | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<PublicProfile[]>([]);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [perms, setPerms] = useState<PermMaps>({
    iAllowThem: new Map(),
    theyAllowMe: new Map(),
  });
  const [inbox, setInbox] = useState<VoiceMessageRow[]>([]);
  const [fromNames, setFromNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !uid) return;
    setBusy(true);
    try {
      const prof = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', uid)
        .single();
      if (!prof.error && prof.data) {
        setMyProfile(prof.data as { username: string; display_name: string | null });
      }

      const rows = await fetchFriendshipsWithProfiles(supabase, uid);
      setFriends(rows);

      const accepted = rows
        .filter((r) => r.friendship.status === 'accepted')
        .map((r) => r.other.id);
      const pm = await loadVoicePermissionMaps(supabase, uid, accepted);
      setPerms(pm);

      const msgs = await listIncomingVoice(supabase, uid);
      setInbox(msgs);

      const fromIds = [...new Set(msgs.map((m) => m.from_user_id))];
      if (fromIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', fromIds);
        const nm = new Map<string, string>();
        for (const p of profs ?? []) {
          nm.set(p.id as string, p.username as string);
        }
        setFromNames(nm);
      } else {
        setFromNames(new Map());
      }
    } catch (e) {
      Alert.alert(
        t('friends.alertLoadFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    } finally {
      setBusy(false);
    }
  }, [supabase, uid, t]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync();
      void soundRef.current?.unloadAsync();
    };
  }, []);

  const voiceSendDetail = (e: unknown) => {
    const kind = classifyVoiceUploadError(e);
    if (kind === 'permission') return t('friends.voiceErrPermission');
    if (kind === 'friends') return t('friends.voiceErrFriends');
    return e instanceof Error ? e.message : t('common.retryLater');
  };

  const runSearch = async () => {
    if (!supabase || !uid) return;
    try {
      const hits = await searchProfilesByUsername(supabase, searchQ, uid);
      setSearchHits(hits);
    } catch (e) {
      Alert.alert(
        t('friends.alertSearchFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const onInvite = async (target: PublicProfile) => {
    if (!supabase || !uid) return;
    try {
      await sendFriendRequest(supabase, uid, target.id);
      Alert.alert(
        t('friends.alertInvitedTitle'),
        t('friends.alertInvitedMsg', { user: target.username }),
      );
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('23505') || msg.toLowerCase().includes('duplicate')) {
        Alert.alert(t('friends.alertInviteFail'), t('friends.alertInviteDup'));
        return;
      }
      Alert.alert(
        t('friends.alertInviteFail'),
        msg || t('common.retryLater'),
      );
    }
  };

  const onAccept = async (fid: string) => {
    if (!supabase || !uid) return;
    try {
      await acceptFriendRequest(supabase, fid, uid);
      await reload();
    } catch (e) {
      Alert.alert(
        t('friends.alertAcceptFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const onReject = async (fid: string) => {
    if (!supabase || !uid) return;
    try {
      await deleteFriendship(supabase, fid);
      await reload();
    } catch (e) {
      Alert.alert(
        t('friends.alertDeleteFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const toggleAllowThem = async (friendId: string, val: boolean) => {
    if (!supabase || !uid) return;
    try {
      await setVoicePermission(supabase, uid, friendId, val);
      setPerms((p) => {
        const next = { ...p, iAllowThem: new Map(p.iAllowThem) };
        next.iAllowThem.set(friendId, val);
        return next;
      });
    } catch (e) {
      Alert.alert(
        t('friends.alertUpdateFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const startRecording = async (friendId: string) => {
    if (Platform.OS === 'web') {
      Alert.alert(t('friends.alertNoWebRecord'), t('friends.alertNoWebRecordMsg'));
      return;
    }
    if (!supabase || !uid) return;

    const allowed = perms.theyAllowMe.get(friendId) === true;
    if (!allowed) {
      Alert.alert(t('friends.alertNoSendTitle'), t('friends.alertNoSendMsg'));
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('friends.alertMicTitle'), t('friends.alertMicMsg'));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        recordingRef.current = null;
      }

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await rec.startAsync();
      recordingRef.current = rec;
      setRecordingFor(friendId);
    } catch (e) {
      Alert.alert(
        t('friends.alertRecStartFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const stopAndSend = async () => {
    const rec = recordingRef.current;
    const peerId = recordingFor;
    if (!rec || !peerId || !supabase || !uid) return;

    try {
      const statusBefore = await rec.getStatusAsync();
      const durSec =
        typeof statusBefore.durationMillis === 'number' &&
        statusBefore.durationMillis > 0
          ? Math.max(1, Math.round(statusBefore.durationMillis / 1000))
          : null;

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      if (!uri) {
        Alert.alert(t('friends.alertNoFileTitle'), t('friends.alertNoFileMsg'));
        return;
      }

      setBusy(true);
      await sendVoiceMessage(supabase, uid, peerId, uri, durSec);
      Alert.alert(t('friends.alertSentTitle'), t('friends.alertSentMsg'));
      await reload();
    } catch (e) {
      Alert.alert(t('friends.alertSendFail'), voiceSendDetail(e));
    } finally {
      recordingRef.current = null;
      setRecordingFor(null);
      setBusy(false);
    }
  };

  const cancelRecording = async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecordingFor(null);
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
    }
  };

  const playMessage = async (msg: VoiceMessageRow) => {
    if (!supabase) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const url = await createVoiceSignedUrl(supabase, msg.storage_path, 600);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      void markVoicePlayed(supabase, msg.id).then(() => reload());
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        if ('didJustFinish' in s && s.didJustFinish) {
          void sound.unloadAsync();
          if (soundRef.current === sound) soundRef.current = null;
        }
      });
    } catch (e) {
      Alert.alert(
        t('friends.alertPlayFail'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  if (!supabase || !uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('friends.needLogin')}</Text>
      </View>
    );
  }

  const pending = friends.filter((f) => f.friendship.status === 'pending');
  const accepted = friends.filter((f) => f.friendship.status === 'accepted');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.title}>{t('friends.title')}</Text>
            {myProfile ? (
              <Text style={styles.sub}>
                @{myProfile.username}
                {myProfile.display_name ? ` · ${myProfile.display_name}` : ''}
              </Text>
            ) : (
              <Text style={styles.sub}>—</Text>
            )}
          </View>
          <Pressable style={styles.signOut} onPress={() => void signOut()}>
            <Text style={styles.signOutText}>{t('friends.signOut')}</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={styles.loader}>
            <ActivityIndicator color="#7dd3fc" />
          </View>
        ) : null}

        {Platform.OS === 'web' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t('friends.webBanner')}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>{t('friends.searchSection')}</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder={t('friends.searchPh')}
            placeholderTextColor="#5a6a82"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          <Pressable style={styles.searchBtn} onPress={() => void runSearch()}>
            <Text style={styles.searchBtnText}>{t('friends.search')}</Text>
          </Pressable>
        </View>
        {searchHits.map((p) => (
          <View key={p.id} style={styles.hitRow}>
            <Text style={styles.hitName}>
              @{p.username}
              {p.display_name ? ` · ${p.display_name}` : ''}
            </Text>
            <Pressable style={styles.miniChip} onPress={() => void onInvite(p)}>
              <Text style={styles.miniChipText}>{t('friends.addFriend')}</Text>
            </Pressable>
          </View>
        ))}

        {pending.length ? (
          <>
            <Text style={styles.section}>{t('friends.pendingSection')}</Text>
            {pending.map((f) => (
              <View key={f.friendship.id} style={styles.card}>
                <Text style={styles.cardTitle}>@{f.other.username}</Text>
                <Text style={styles.hint}>
                  {f.isIncoming
                    ? t('friends.inviteIncoming')
                    : t('friends.inviteOutgoing')}
                </Text>
                <View style={styles.rowWrap}>
                  {f.isIncoming ? (
                    <>
                      <Pressable
                        style={styles.chip}
                        onPress={() => void onAccept(f.friendship.id)}
                      >
                        <Text style={styles.chipText}>{t('friends.accept')}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chip, styles.chipDanger]}
                        onPress={() => void onReject(f.friendship.id)}
                      >
                        <Text style={styles.chipText}>{t('friends.reject')}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={[styles.chip, styles.chipDanger]}
                      onPress={() => void onReject(f.friendship.id)}
                    >
                      <Text style={styles.chipText}>{t('friends.cancelInvite')}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>{t('friends.friendsSection')}</Text>
        {accepted.length === 0 ? (
          <Text style={styles.muted}>{t('friends.noFriends')}</Text>
        ) : (
          accepted.map((f) => {
            const friendId = f.other.id;
            const iAllow = perms.iAllowThem.get(friendId) === true;
            const theyAllow = perms.theyAllowMe.get(friendId) === true;
            const isRec = recordingFor === friendId;

            return (
              <View key={f.friendship.id} style={styles.card}>
                <Text style={styles.cardTitle}>@{f.other.username}</Text>
                <Text style={styles.hint}>
                  {theyAllow
                    ? t('friends.theyAllowVoice')
                    : t('friends.theyDenyVoice')}
                </Text>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{t('friends.allowThemSwitch')}</Text>
                  <Switch
                    value={iAllow}
                    onValueChange={(v) => void toggleAllowThem(friendId, v)}
                    trackColor={{ false: '#243044', true: '#1e3a5f' }}
                    thumbColor={iAllow ? '#7dd3fc' : '#64748b'}
                  />
                </View>

                {theyAllow ? (
                  <View style={styles.rowWrap}>
                    {!isRec ? (
                      <Pressable
                        style={styles.chip}
                        onPress={() => void startRecording(friendId)}
                      >
                        <Text style={styles.chipText}>{t('friends.startRecord')}</Text>
                      </Pressable>
                    ) : (
                      <>
                        <Pressable
                          style={[styles.chip, styles.chipAlt]}
                          onPress={() => void stopAndSend()}
                        >
                          <Text style={styles.chipText}>{t('friends.stopSend')}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.chip, styles.chipDanger]}
                          onPress={() => void cancelRecording()}
                        >
                          <Text style={styles.chipText}>{t('friends.cancelRec')}</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        <Text style={styles.section}>{t('friends.inboxSection')}</Text>
        {inbox.length === 0 ? (
          <Text style={styles.muted}>{t('friends.noMessages')}</Text>
        ) : (
          inbox.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {t('friends.from', {
                  name: fromNames.get(m.from_user_id) ?? m.from_user_id.slice(0, 8),
                })}
              </Text>
              <Text style={styles.hint}>
                {new Date(m.created_at).toLocaleString()}
                {m.played_at ? t('friends.played') : ''}
              </Text>
              <Pressable
                style={styles.chip}
                onPress={() => void playMessage(m)}
              >
                <Text style={styles.chipText}>{t('friends.play')}</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginVertical: 8 },
  title: {
    color: '#e8eef8',
    fontSize: 22,
    fontWeight: '700',
  },
  sub: { color: '#8b9bb4', fontSize: 13, marginTop: 4 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  signOut: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#3d2030',
    borderWidth: 1,
    borderColor: '#6b3045',
  },
  signOutText: { color: '#f9a8d4', fontWeight: '600' },
  banner: {
    backgroundColor: '#2a2510',
    borderColor: '#ca8a04',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { color: '#fcd34d', fontSize: 12, lineHeight: 18 },
  section: {
    color: '#c5d0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 8,
  },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: '#141c2c',
    borderWidth: 1,
    borderColor: '#243044',
    borderRadius: 10,
    padding: 12,
    color: '#e8eef8',
  },
  searchBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#e8eef8', fontWeight: '700' },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#243044',
  },
  hitName: { color: '#e8eef8', flex: 1, marginRight: 8 },
  miniChip: {
    backgroundColor: '#2d4a3e',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  miniChipText: { color: '#e8eef8', fontWeight: '600', fontSize: 12 },
  card: {
    backgroundColor: '#141c2c',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#243044',
  },
  cardTitle: { color: '#e8eef8', fontSize: 15, fontWeight: '600' },
  hint: {
    color: '#6b7c95',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  chip: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  chipAlt: { backgroundColor: '#2d4a3e' },
  chipDanger: { backgroundColor: '#3d2030' },
  chipText: { color: '#e8eef8', fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: { color: '#94a3b8', flex: 1, marginRight: 12 },
  muted: { color: '#5a6a82', fontSize: 13, marginBottom: 8 },
});
