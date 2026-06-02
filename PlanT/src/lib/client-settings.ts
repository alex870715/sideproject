import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  OPENAI_KEY_HEADER,
} from "@/lib/ai-credentials";
import {
  type AiProvider,
  AI_PROVIDERS,
  isAiProvider,
} from "@/types/ai-provider";

const SETTINGS_KEY = "plant_ai_settings";
const LEGACY_OPENAI_KEY = "plant_openai_api_key";

export type StoredAiSettings = {
  provider: AiProvider;
  keys: Partial<Record<AiProvider, string>>;
};

function defaultSettings(): StoredAiSettings {
  return { provider: "openai", keys: {} };
}

function migrateLegacy(): StoredAiSettings | null {
  if (typeof window === "undefined") return null;
  const legacy = localStorage.getItem(LEGACY_OPENAI_KEY);
  if (!legacy) return null;
  return { provider: "openai", keys: { openai: legacy } };
}

export function getAiSettings(): StoredAiSettings {
  if (typeof window === "undefined") return defaultSettings();

  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAiSettings;
      if (parsed.provider && isAiProvider(parsed.provider)) {
        return { provider: parsed.provider, keys: parsed.keys ?? {} };
      }
    } catch {
      /* fall through */
    }
  }

  const migrated = migrateLegacy();
  if (migrated) {
    saveAiSettings(migrated);
    localStorage.removeItem(LEGACY_OPENAI_KEY);
    return migrated;
  }

  return defaultSettings();
}

export function saveAiSettings(settings: StoredAiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getStoredProvider(): AiProvider {
  return getAiSettings().provider;
}

export function getStoredApiKey(provider?: AiProvider): string {
  const settings = getAiSettings();
  const p = provider ?? settings.provider;
  return settings.keys[p] ?? "";
}

export function setStoredProvider(provider: AiProvider): void {
  const settings = getAiSettings();
  saveAiSettings({ ...settings, provider });
}

export function setStoredApiKey(provider: AiProvider, key: string): void {
  const settings = getAiSettings();
  const keys = { ...settings.keys };
  const trimmed = key.trim();
  if (trimmed) keys[provider] = trimmed;
  else delete keys[provider];
  saveAiSettings({ ...settings, keys });
}

export function hasConfiguredAi(): boolean {
  const settings = getAiSettings();
  const key = settings.keys[settings.provider];
  return !!key && key.length >= 10;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 12) return "";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function getProviderInfo(provider: AiProvider) {
  return AI_PROVIDERS.find((p) => p.id === provider)!;
}

/** Headers for PlanT AI API routes. */
export function aiRequestHeaders(): Record<string, string> {
  const settings = getAiSettings();
  const key = settings.keys[settings.provider];
  if (!key) return {};
  return {
    [AI_PROVIDER_HEADER]: settings.provider,
    [AI_KEY_HEADER]: key,
  };
}

/** @deprecated */
export function getStoredOpenAIKey(): string {
  return getStoredApiKey("openai");
}

/** @deprecated */
export function setStoredOpenAIKey(key: string): void {
  setStoredApiKey("openai", key);
}

/** @deprecated */
export function hasStoredOpenAIKey(): boolean {
  return hasConfiguredAi() && getStoredProvider() === "openai";
}

/** @deprecated */
export function maskOpenAIKey(key: string): string {
  return maskApiKey(key);
}
