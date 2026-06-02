import { StyleSheet, Text, View } from 'react-native';

type Props = {
  displayName: string;
  username: string;
  subtitle?: string;
};

export function ProfileHeroCard({ displayName, username, subtitle }: Props) {
  const showUser = username.length > 0;
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(displayName || username || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name}>{displayName || username || '—'}</Text>
      {showUser ? (
        <Text style={styles.handle}>@{username}</Text>
      ) : null}
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141c2c',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#243044',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { color: '#7dd3fc', fontSize: 26, fontWeight: '800' },
  name: {
    color: '#e8eef8',
    fontSize: 20,
    fontWeight: '700',
  },
  handle: {
    color: '#7dd3fc',
    fontSize: 14,
    marginTop: 4,
  },
  sub: {
    color: '#8b9bb4',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
});
