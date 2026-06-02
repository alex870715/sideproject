export type AiProvider = "openai" | "google" | "anthropic";

export type AiProviderInfo = {
  id: AiProvider;
  name: string;
  shortName: string;
  keyUrl: string;
  placeholder: string;
  keyHint: string;
};

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    name: "ChatGPT（OpenAI）",
    shortName: "ChatGPT",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-...",
    keyHint: "以 sk- 開頭",
  },
  {
    id: "google",
    name: "Google AI Studio（Gemini）",
    shortName: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza...",
    keyHint: "Google AI Studio 建立的 API Key",
  },
  {
    id: "anthropic",
    name: "Claude（Anthropic）",
    shortName: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
    keyHint: "以 sk-ant- 開頭",
  },
];

export function isAiProvider(value: string): value is AiProvider {
  return value === "openai" || value === "google" || value === "anthropic";
}
