import type { AiCredentials } from "@/lib/ai-credentials";
import { resolveAiCredentials } from "@/lib/ai-credentials";
import { aiComplete } from "@/lib/ai-providers/complete";

export function isOpenAIConfigured(
  provider?: string | null,
  apiKey?: string | null
): boolean {
  return resolveAiCredentials(provider, apiKey) !== null;
}

/** @deprecated use isOpenAIConfigured with credentials */
export function isAiConfigured(credentials: AiCredentials | null): boolean {
  return credentials !== null;
}

export async function generateFairyTaleBooklet(
  tripTitle: string,
  itinerary: string,
  provider?: string | null,
  apiKey?: string | null
): Promise<string> {
  const credentials = resolveAiCredentials(provider, apiKey);
  if (!credentials) {
    throw new Error("請在 PlanT「AI 設定」中選擇平台並輸入 API Key");
  }

  const content = await aiComplete(credentials, {
    system: `You are a whimsical travel storyteller for PlanT, an eco-friendly group travel app themed around plants and growth.
Write a nostalgic, magical fairy-tale style travel storybook in Markdown.
Use chapter headings, gentle prose, plant and garden metaphors (trunk routes, sprouts, grafting).
Keep it warm, family-friendly, and under 800 words. Write in Traditional Chinese.`,
    user: `Trip: ${tripTitle}\n\nItinerary data:\n${itinerary}`,
    temperature: 0.8,
  });

  return (
    content ||
    "# Your PlanT Storybook\n\nThe seeds of adventure are still sprouting..."
  );
}
