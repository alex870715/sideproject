/**
 * User-authored agent prompts stored separately from the quiz-generated TasteProfile.
 * Null / empty trim => fall back to automatic defaults where applicable.
 */
export type AgentPromptOverrides = {
  /** 品味檔案補充：自由文字，會排在問卷摘錄前並進入自動合併預覽（除非整份合併已被手動覆寫） */
  tasteStoryManual: string | null;
  /** 覆寫問卷的 systemPromptSnippet；null 則用問卷原文 */
  systemPromptSnippetManual: string | null;
  /** 覆寫整份「合併預覽」字串；有值時不再自動拼接紀錄／問卷 */
  mergedContextManual: string | null;
};

export const EMPTY_AGENT_PROMPT_OVERRIDES: AgentPromptOverrides = {
  tasteStoryManual: null,
  systemPromptSnippetManual: null,
  mergedContextManual: null,
};
