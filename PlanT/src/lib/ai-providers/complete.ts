import type { AiCredentials } from "@/lib/ai-credentials";

export type AiCompleteOptions = {
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
};

/** Models to try in order (Google retires older IDs frequently). */
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
];

export async function aiComplete(
  credentials: AiCredentials,
  options: AiCompleteOptions
): Promise<string> {
  const { provider, apiKey } = credentials;

  switch (provider) {
    case "openai":
      return completeOpenAI(apiKey, options);
    case "google":
      return completeGoogle(apiKey, options);
    case "anthropic":
      return completeAnthropic(apiKey, options);
    default:
      throw new Error("不支援的 AI 平台");
  }
}

async function completeOpenAI(
  apiKey: string,
  options: AiCompleteOptions
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    temperature: options.temperature ?? 0.7,
  });

  return completion.choices[0]?.message?.content ?? "";
}

async function completeGoogle(
  apiKey: string,
  options: AiCompleteOptions
): Promise<string> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: options.system }] },
    contents: [{ role: "user", parts: [{ text: options.user }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      ...(options.jsonMode
        ? { responseMimeType: "application/json" }
        : {}),
    },
  };

  let lastError = "未知錯誤";

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        lastError = err.slice(0, 300);
        if (res.status === 404) continue;
        throw new Error(`Gemini API 錯誤：${lastError}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = "Gemini 未回傳內容";
        continue;
      }
      return text;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gemini API")) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    `Gemini API 錯誤：目前可用的模型皆無法使用。請確認 Google AI Studio 金鑰是否有效。(${lastError.slice(0, 120)})`
  );
}

async function completeAnthropic(
  apiKey: string,
  options: AiCompleteOptions
): Promise<string> {
  const system = options.jsonMode
    ? `${options.system}\n\nRespond with valid JSON only, no markdown fences.`
    : options.system;

  const models = [
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-haiku-20240307",
  ];

  let lastError = "";

  for (const model of models) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: options.user }],
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      lastError = (await res.text()).slice(0, 300);
      if (res.status === 404) continue;
      throw new Error(`Claude API 錯誤：${lastError}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };

    const block = data.content?.find((c) => c.type === "text");
    if (block?.text) return block.text;
    lastError = "Claude 未回傳內容";
  }

  throw new Error(`Claude API 錯誤：${lastError.slice(0, 200)}`);
}
