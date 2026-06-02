import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

export const LANG_STORAGE_KEY = 'earth-online-lang-v1';

export const SUPPORTED_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGS)[number];

const resources = {
  en: { translation: en },
  ja: { translation: ja },
  ko: { translation: ko },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
} as const;

function deviceLanguage(): AppLanguage {
  const tag = Localization.getLocales?.()?.[0]?.languageTag ?? 'en';
  if (tag.startsWith('zh')) {
    if (tag.includes('TW') || tag.includes('Hant') || tag === 'zh-HK') {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  if (tag.startsWith('ja')) return 'ja';
  if (tag.startsWith('ko')) return 'ko';
  return 'en';
}

function isAppLanguage(x: string): x is AppLanguage {
  return (SUPPORTED_LANGS as readonly string[]).includes(x);
}

export async function initI18n(): Promise<void> {
  let lng: AppLanguage = deviceLanguage();
  try {
    const raw = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (raw && isAppLanguage(raw)) lng = raw;
  } catch {
    /* use device default */
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });
}

export async function setAppLanguage(lng: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
