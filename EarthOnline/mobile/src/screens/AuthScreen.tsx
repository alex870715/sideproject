import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getSupabase } from '../lib/supabase';
import { formatAuthError } from './authFormatError';

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

type AuthNav = NativeStackNavigationProp<
  { AuthLogin: undefined; AuthSettings: undefined },
  'AuthLogin'
>;

export function AuthScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<AuthNav>();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const sb = getSupabase();
    if (!sb) {
      Alert.alert(t('auth.alertConfigTitle'), t('auth.alertConfigMsg'));
      return;
    }

    const em = email.trim();
    const pw = password;
    if (!em || !pw) {
      Alert.alert(t('auth.alertFieldsTitle'), t('auth.alertFieldsMsg'));
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error } = await sb.auth.signInWithPassword({
          email: em,
          password: pw,
        });
        if (error) throw error;
        return;
      }

      const un = normalizeUsername(username);
      if (un.length < 3 || un.length > 32) {
        throw new Error(t('auth.usernameRule'));
      }

      const { data, error } = await sb.auth.signUp({
        email: em,
        password: pw,
        options: {
          data: {
            username: un,
            display_name: (displayName.trim() || un).slice(0, 40),
          },
        },
      });
      if (error) throw error;

      if (!data.session) {
        Alert.alert(t('auth.alertVerifyTitle'), t('auth.alertVerifyMsg'));
      }
    } catch (e) {
      Alert.alert(t('auth.alertAuthFailTitle'), formatAuthError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.settingsLink}
          onPress={() => navigation.navigate('AuthSettings')}
          accessibilityRole="button"
        >
          <Text style={styles.settingsLinkText}>{t('auth.settingsLink')}</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{t('auth.title')}</Text>
      <Text style={styles.sub}>{t('auth.subtitle')}</Text>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, mode === 'signIn' && styles.tabActive]}
          onPress={() => setMode('signIn')}
        >
          <Text style={[styles.tabText, mode === 'signIn' && styles.tabTextActive]}>
            {t('auth.signIn')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === 'signUp' && styles.tabActive]}
          onPress={() => setMode('signUp')}
        >
          <Text style={[styles.tabText, mode === 'signUp' && styles.tabTextActive]}>
            {t('auth.signUp')}
          </Text>
        </Pressable>
      </View>

      {mode === 'signUp' ? (
        <>
          <Text style={styles.label}>{t('auth.usernamePublic')}</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder={t('auth.usernamePh')}
            placeholderTextColor="#5a6a82"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={[styles.label, styles.labelSp]}>{t('auth.displayName')}</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('auth.displayNamePh')}
            placeholderTextColor="#5a6a82"
            style={styles.input}
          />
        </>
      ) : null}

      <Text style={styles.label}>{t('auth.email')}</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.emailPh')}
        placeholderTextColor="#5a6a82"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />

      <Text style={styles.label}>{t('auth.password')}</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.passwordPh')}
        placeholderTextColor="#5a6a82"
        secureTextEntry
        style={styles.input}
      />

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          pressed && styles.ctaPressed,
          busy && styles.ctaDisabled,
        ]}
        onPress={() => void onSubmit()}
        disabled={busy}
      >
        <Text style={styles.ctaText}>
          {busy
            ? t('auth.submitBusy')
            : mode === 'signIn'
              ? t('auth.submitSignIn')
              : t('auth.submitSignUp')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1220',
    padding: 24,
    paddingTop: 56,
  },
  topRow: { alignItems: 'flex-end', marginBottom: 8 },
  settingsLink: { paddingVertical: 6, paddingHorizontal: 10 },
  settingsLinkText: { color: '#7dd3fc', fontWeight: '600', fontSize: 14 },
  title: {
    color: '#e8eef8',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  sub: {
    color: '#8b9bb4',
    fontSize: 15,
    marginBottom: 28,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#141c2c',
    borderWidth: 1,
    borderColor: '#243044',
    alignItems: 'center',
  },
  tabActive: {
    borderColor: '#7dd3fc',
    backgroundColor: '#1e3a5f',
  },
  tabText: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#e8eef8',
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  labelSp: { marginTop: 12 },
  input: {
    backgroundColor: '#141c2c',
    borderWidth: 1,
    borderColor: '#243044',
    borderRadius: 10,
    padding: 12,
    color: '#e8eef8',
    marginBottom: 14,
  },
  cta: {
    marginTop: 8,
    backgroundColor: '#1e3a5f',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.9 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    color: '#e8eef8',
    fontSize: 16,
    fontWeight: '700',
  },
});
