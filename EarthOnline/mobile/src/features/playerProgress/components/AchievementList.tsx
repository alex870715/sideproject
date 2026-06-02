import { StyleSheet, Text, View } from 'react-native';
import type { AchievementTier } from '../types';

const TIER_COLOR: Record<AchievementTier, string> = {
  bronze: '#cd7f32',
  silver: '#94a3b8',
  gold: '#eab308',
};

type Props = {
  items: { id: string; tier: AchievementTier; unlocked: boolean }[];
  title: string;
  t: (key: string) => string;
};

export function AchievementList({ items, title, t }: Props) {
  const unlockedN = items.filter((i) => i.unlocked).length;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>
        {title}{' '}
        <Text style={styles.count}>({unlockedN}/{items.length})</Text>
      </Text>
      <View style={styles.grid}>
        {items.map((a) => (
          <View
            key={a.id}
            style={[styles.card, !a.unlocked && styles.cardLocked]}
          >
            <View
              style={[
                styles.badge,
                { borderColor: TIER_COLOR[a.tier] },
                !a.unlocked && styles.badgeMuted,
              ]}
            >
              <Text style={styles.badgeLetter}>
                {a.tier === 'gold' ? 'G' : a.tier === 'silver' ? 'S' : 'B'}
              </Text>
            </View>
            <Text
              style={[styles.cardTitle, !a.unlocked && styles.textMuted]}
              numberOfLines={2}
            >
              {t(`playerProgress.achievements.${a.id}.title`)}
            </Text>
            <Text style={[styles.cardDesc, !a.unlocked && styles.textMuted]} numberOfLines={3}>
              {t(`playerProgress.achievements.${a.id}.desc`)}
            </Text>
            {!a.unlocked ? (
              <Text style={styles.lockedLabel}>{t('playerProgress.locked')}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  sectionTitle: {
    color: '#e8eef8',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  count: { color: '#7dd3fc', fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#141c2c',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#243044',
  },
  cardLocked: { opacity: 0.72 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeMuted: { opacity: 0.45 },
  badgeLetter: {
    color: '#e8eef8',
    fontWeight: '800',
    fontSize: 14,
  },
  cardTitle: {
    color: '#e8eef8',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
    color: '#8b9bb4',
    fontSize: 12,
    lineHeight: 16,
  },
  textMuted: { color: '#5a6a82' },
  lockedLabel: {
    marginTop: 8,
    fontSize: 11,
    color: '#6b7c95',
    fontWeight: '600',
  },
});
