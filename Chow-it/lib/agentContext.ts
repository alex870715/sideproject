import { mealLogsContextForPrompt } from '@/lib/mealLogPrompt';
import type { AgentPromptOverrides } from '@/types/agentPromptOverrides';
import type { MealLogEntry } from '@/types/mealLog';
import type { TasteProfile } from '@/types/tasteProfile';

/** Resolved snippet shown as 「系統提示摘錄」— manual wins over quiz. */
export function effectiveSystemPromptSnippet(
  profile: TasteProfile | null,
  overrides: AgentPromptOverrides | null,
): string {
  const manual = overrides?.systemPromptSnippetManual?.trim();
  if (manual) return manual;
  return profile?.systemPromptSnippet?.trim() ?? '';
}

/** Single string you can pass as extra system context when calling an LLM later. */
export function buildAgentSystemContext(
  profile: TasteProfile | null,
  logs: MealLogEntry[],
  overrides?: AgentPromptOverrides | null,
): string {
  if (overrides?.mergedContextManual?.trim()) {
    return overrides.mergedContextManual.trim();
  }

  const chunks: string[] = [];
  const story = overrides?.tasteStoryManual?.trim();
  if (story) {
    chunks.push(`【品味檔案｜自訂補充】\n${story}`);
  }

  const snippet = effectiveSystemPromptSnippet(profile, overrides ?? null);
  if (snippet) chunks.push(snippet);

  const logChunk = mealLogsContextForPrompt(logs);
  if (logChunk) chunks.push(logChunk);

  return chunks.join('\n\n');
}
