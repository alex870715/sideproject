import type { LocalePreference } from "./storage";

/** 選單採「各語言自稱」，不依目前介面語系切換，避免選到看不懂的語言。 */
export const LOCALE_SELECT_OPTIONS: {
  value: LocalePreference;
  label: string;
}[] = [
  { value: "auto", label: "自動（跟隨瀏覽器） · Auto · 自動 · 자동" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];
