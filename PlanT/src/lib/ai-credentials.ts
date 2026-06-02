import {
  type AiProvider,
  AI_PROVIDERS,
  isAiProvider,
} from "@/types/ai-provider";

export const AI_PROVIDER_HEADER = "x-plant-ai-provider";
export const AI_KEY_HEADER = "x-plant-ai-key";
/** @deprecated use AI_KEY_HEADER */
export const OPENAI_KEY_HEADER = "x-plant-openai-key";

export type AiCredentials = {
  provider: AiProvider;
  apiKey: string;
};

export function isValidKeyForProvider(
  provider: AiProvider,
  apiKey: string | null | undefined
): boolean {
  const key = apiKey?.trim();
  if (!key || key.length < 10) return false;
  const lower = key.toLowerCase();
  if (lower.includes("your-openai") || lower.includes("sk-your")) return false;

  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && key.length >= 20;
    case "google":
      return key.startsWith("AIza") || key.length >= 20;
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length >= 20;
    default:
      return false;
  }
}

export function resolveAiCredentials(
  provider?: string | null,
  apiKey?: string | null
): AiCredentials | null {
  const p =
    provider && isAiProvider(provider) ? provider : ("openai" as AiProvider);
  if (isValidKeyForProvider(p, apiKey)) {
    return { provider: p, apiKey: apiKey!.trim() };
  }
  return null;
}

export function getAiCredentialsFromRequest(
  request: Request
): AiCredentials | null {
  const provider = request.headers.get(AI_PROVIDER_HEADER);
  const key =
    request.headers.get(AI_KEY_HEADER) ??
    request.headers.get(OPENAI_KEY_HEADER);
  return resolveAiCredentials(provider, key);
}

export function getProviderLabel(provider: AiProvider): string {
  return AI_PROVIDERS.find((p) => p.id === provider)?.shortName ?? provider;
}
