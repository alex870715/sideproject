import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_AGENT_PROMPT_OVERRIDES,
  type AgentPromptOverrides,
} from '@/types/agentPromptOverrides';

const KEY = '@chowit/agent_prompt_overrides_v1';

function normalize(raw: unknown): AgentPromptOverrides {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_AGENT_PROMPT_OVERRIDES };
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null);
  return {
    tasteStoryManual: str('tasteStoryManual'),
    systemPromptSnippetManual: str('systemPromptSnippetManual'),
    mergedContextManual: str('mergedContextManual'),
  };
}

export async function loadAgentPromptOverrides(): Promise<AgentPromptOverrides> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_AGENT_PROMPT_OVERRIDES };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...EMPTY_AGENT_PROMPT_OVERRIDES };
  }
}

export async function saveAgentPromptOverrides(next: AgentPromptOverrides): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function patchAgentPromptOverrides(
  patch: Partial<AgentPromptOverrides>,
): Promise<AgentPromptOverrides> {
  const prev = await loadAgentPromptOverrides();
  const next = { ...prev, ...patch };
  await saveAgentPromptOverrides(next);
  return next;
}
