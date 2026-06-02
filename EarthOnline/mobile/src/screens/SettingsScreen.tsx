import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MAP_BASE_STYLE_OPTIONS,
} from '../geo/mapboxStyleUrl';
import { setAppLanguage, type AppLanguage, SUPPORTED_LANGS } from '../i18n/i18n';
import { useSettingsStore } from '../store/settingsStore';

const LANG_LIST: AppLanguage[] = [...SUPPORTED_LANGS];

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const mapBaseStyle = useSettingsStore((s) => s.mapBaseStyle);
  const setMapBaseStyle = useSettingsStore((s) => s.setMapBaseStyle);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>{t('settings.title')}</Text>

      <Text style={styles.section}>{t('settings.languageSection')}</Text>
      <Text style={styles.hint}>{t('settings.languageHint')}</Text>
      <View style={styles.rowWrap}>
        {LANG_LIST.map((lng) => {
          const on = i18n.language === lng;
          return (
            <Pressable
              key={lng}
              style={({ pressed }) => [
                styles.chip,
                on && styles.chipOn,
                pressed && styles.chipPressed,
              ]}
              onPress={() => void setAppLanguage(lng)}
            >
              <Text style={styles.chipText}>
                {t(`settings.langs.${lng}` as const)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, styles.sectionSp]}>
        {t('settings.mapSection')}
      </Text>
      <Text style={styles.hint}>{t('settings.mapHint')}</Text>
      <View style={styles.rowWrap}>
        {MAP_BASE_STYLE_OPTIONS.map((id) => {
          const on = mapBaseStyle === id;
          return (
            <Pressable
              key={id}
              style={({ pressed }) => [
                styles.chip,
                on && styles.chipOn,
                pressed && styles.chipPressed,
              ]}
              onPress={() => setMapBaseStyle(id)}
            >
              <Text style={styles.chipText}>
                {t(`settings.map_${id}` as 'settings.map_satellite')}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
    fontWeight: '700',
    marginBottom: 20,
  },
  section: {
    color: '#c5d0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionSp: { marginTop: 20 },
  hint: {
    color: '#6b7c95',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243044',
  },
  chipOn: {
    backgroundColor: '#1e40af',
    borderColor: '#7dd3fc',
  },
  chipPressed: { opacity: 0.88 },
  chipText: {
    color: '#e8eef8',
    fontSize: 14,
    fontWeight: '600',
  },
});
