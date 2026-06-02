import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuthSession } from '../../../hooks/useAuthSession';
import { useGameStore } from '../../../store/gameStore';
import { AchievementList } from '../components/AchievementList';
import { LevelProgressCard } from '../components/LevelProgressCard';
import { ProfileHeroCard } from '../components/ProfileHeroCard';
import { usePlayerProgress } from '../hooks/usePlayerProgress';

export function PlayerProfileScreen() {
  const { t } = useTranslation();
  const { session, supabase } = useAuthSession();
  const visitPinsLen = useGameStore((s) => s.visitPins.length);
  const {
    loading,
    error,
    schemaHint,
    state,
    achievements,
    progress01,
    xpToNext,
    effectiveLevel,
    refresh,
  } = usePlayerProgress(session, supabase);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const loggedIn = Boolean(session?.user);
  const showProgress = loggedIn && state != null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>{t('playerProgress.title')}</Text>

      <ProfileHeroCard
        displayName={loggedIn ? (state?.displayName ?? '') : t('playerProgress.guestName')}
        username={state?.username ?? ''}
        subtitle={
          loggedIn
            ? undefined
            : t('playerProgress.guestHint')
        }
      />

      {schemaHint ? (
        <Text style={styles.warn}>{t('playerProgress.dbMissingHint')}</Text>
      ) : null}

      {error && !schemaHint ? (
        <Text style={styles.err}>{error}</Text>
      ) : null}

      {loggedIn && loading ? (
        <ActivityIndicator color="#7dd3fc" style={styles.spinner} />
      ) : null}

      {showProgress ? (
        <LevelProgressCard
          level={effectiveLevel}
          xpTotal={state.xpTotal}
          progress01={progress01}
          xpToNext={xpToNext}
          labels={{
            level: t('playerProgress.level'),
            xp: t('playerProgress.xp'),
            xpToNext: t('playerProgress.xpToNext'),
            maxLevel: t('playerProgress.maxLevel'),
          }}
        />
      ) : null}

      {showProgress ? (
        <View style={styles.stats}>
          <Text style={styles.statsTitle}>{t('playerProgress.statsTitle')}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('playerProgress.stat_checkins')}</Text>
            <Text style={styles.statVal}>{state.checkInCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('playerProgress.stat_countries')}</Text>
            <Text style={styles.statVal}>{state.distinctCountries}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('playerProgress.stat_events')}</Text>
            <Text style={styles.statVal}>{state.eventCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('playerProgress.localPins')}</Text>
            <Text style={styles.statVal}>{state.visitPinCount}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.stats}>
          <Text style={styles.statsTitle}>{t('playerProgress.statsTitle')}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{t('playerProgress.localPins')}</Text>
            <Text style={styles.statVal}>
              {state?.visitPinCount ?? visitPinsLen}
            </Text>
          </View>
        </View>
      )}

      <AchievementList
        items={achievements}
        title={t('playerProgress.achievementsSection')}
        t={t}
      />

      {loggedIn ? (
        <Pressable
          style={({ pressed }) => [styles.reloadBtn, pressed && styles.reloadPressed]}
          onPress={refresh}
        >
          <Text style={styles.reloadText}>{t('playerProgress.refresh')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  screenTitle: {
    color: '#e8eef8',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  warn: {
    color: '#fbbf24',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  err: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 12,
  },
  spinner: { marginVertical: 16 },
  stats: {
    backgroundColor: '#141c2c',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#243044',
    marginBottom: 14,
  },
  statsTitle: {
    color: '#e8eef8',
    fontWeight: '700',
    marginBottom: 10,
    fontSize: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#243044',
  },
  statLabel: { color: '#8b9bb4', fontSize: 14 },
  statVal: { color: '#e8eef8', fontWeight: '600', fontSize: 14 },
  reloadBtn: {
    marginTop: 18,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#1e3a5f',
  },
  reloadPressed: { opacity: 0.85 },
  reloadText: { color: '#7dd3fc', fontWeight: '700', fontSize: 14 },
});
