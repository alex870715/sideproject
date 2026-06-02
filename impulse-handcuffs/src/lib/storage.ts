import { detectLocale, type AppLocale } from "./i18n";

/** 沿用既有鍵名，避免更新後使用者已存的標的／語言偏好被清空。 */
const STORAGE_KEY = "wvp_selected_ticker";
const LOCALE_PREF_KEY = "wvp_ui_locale";

export type LocalePreference = "auto" | AppLocale;

export function getSelectedTicker(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve((result[STORAGE_KEY] as string | undefined) ?? "VOO");
    });
  });
}

export function setSelectedTicker(ticker: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: ticker }, () => resolve());
  });
}

export function onTickerChanged(
  callback: (ticker: string) => void,
): () => void {
  const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local") return;
    const next = changes[STORAGE_KEY]?.newValue;
    if (typeof next === "string") callback(next);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

const DEFAULT_LOCALE_PREF: LocalePreference = "auto";

export function getLocalePreference(): Promise<LocalePreference> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCALE_PREF_KEY], (result) => {
      const raw = result[LOCALE_PREF_KEY] as string | undefined;
      if (
        raw === "auto" ||
        raw === "zh-TW" ||
        raw === "en" ||
        raw === "ja" ||
        raw === "ko"
      ) {
        resolve(raw);
        return;
      }
      resolve(DEFAULT_LOCALE_PREF);
    });
  });
}

export function setLocalePreference(value: LocalePreference): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCALE_PREF_KEY]: value }, () => resolve());
  });
}

export function onLocalePreferenceChanged(
  callback: (value: LocalePreference) => void,
): () => void {
  const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local") return;
    const next = changes[LOCALE_PREF_KEY]?.newValue;
    if (
      next === "auto" ||
      next === "zh-TW" ||
      next === "en" ||
      next === "ja" ||
      next === "ko"
    ) {
      callback(next);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function effectiveLocale(pref: LocalePreference, browser: AppLocale): AppLocale {
  if (pref === "auto") return browser;
  return pref;
}

export async function resolveUiLocale(): Promise<AppLocale> {
  const pref = await getLocalePreference();
  return effectiveLocale(pref, detectLocale());
}
