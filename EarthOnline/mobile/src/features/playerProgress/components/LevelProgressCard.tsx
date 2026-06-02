import { StyleSheet, Text, View } from 'react-native';

type Props = {
  level: number;
  xpTotal: number;
  progress01: number;
  xpToNext: number;
  labels: {
    level: string;
    xp: string;
    xpToNext: string;
    maxLevel: string;
  };
};

export function LevelProgressCard({
  level,
  xpTotal,
  progress01,
  xpToNext,
  labels,
}: Props) {
  const fDone = Math.max(0, progress01);
  const fRest = Math.max(0, 1 - progress01);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>{labels.level}</Text>
          <Text style={styles.levelNum}>{level}</Text>
        </View>
        <View style={styles.xpCol}>
          <Text style={styles.label}>{labels.xp}</Text>
          <Text style={styles.xpVal}>{xpTotal.toLocaleString()}</Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackInner, { flex: fDone || 0.001 }]}>
          <View style={styles.fill} />
        </View>
        <View style={{ flex: fRest || 0.001 }} />
      </View>
      <Text style={styles.hint}>
        {xpToNext > 0
          ? `${labels.xpToNext}: ${xpToNext.toLocaleString()} XP`
          : labels.maxLevel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141c2c',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#243044',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  xpCol: { alignItems: 'flex-end' },
  label: { color: '#8b9bb4', fontSize: 12, marginBottom: 4 },
  levelNum: { color: '#7dd3fc', fontSize: 32, fontWeight: '800' },
  xpVal: { color: '#e8eef8', fontSize: 18, fontWeight: '700' },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0b1220',
    overflow: 'hidden',
  },
  trackInner: {
    minWidth: 2,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  hint: {
    marginTop: 10,
    color: '#6b7c95',
    fontSize: 12,
  },
});
