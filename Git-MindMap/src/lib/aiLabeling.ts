import type { SemanticCategory } from './category'
import { normalizeCategory } from './category'

export type AiProvider = 'openai' | 'ollama'

const SYSTEM = `[Role / 角色] You are an expert software architect. Follow instructions in both languages; output JSON keys and category values in English as specified.

[Task / 任務] Given a README excerpt and a list of repository file paths (relative paths), assign each FILE path exactly one category.

[Categories — use these exact keys in JSON / 分類 — JSON 鍵名請用下列英文]
- entry: main entrypoints (index, main, app bootstrap, CLI entry) · 進入點／啟動點
- config: build/config/tooling (package.json, tsconfig, eslint, docker, CI) · 建置與設定
- business: core domain logic, services, APIs not purely UI · 核心業務／網域邏輯
- ui: components, pages, views, styles for user interface · 使用者介面
- tests: tests, mocks, snapshots · 測試
- assets: images, fonts, static media · 靜態資源
- other: anything else · 其他

[Output / 輸出] Return ONLY compact JSON: {"paths":{"relative/path.tsx":"entry",...}}
Only include files from the provided list; omit folders. If unsure, use "other".
僅輸出 JSON；只列入提供清單中的檔案，不含資料夾；不確定時使用 "other"。`

function truncate(s: string, max: number) {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n…(已截斷 / truncated)`
}

export async function runSemanticLabeling(input: {
  readme: string | null
  filePaths: string[]
  provider: AiProvider
  openAiModel: string
  ollamaModel: string
  openAiKey?: string
}): Promise<Record<string, SemanticCategory>> {
  const pathsSample = input.filePaths.slice(0, 500)
  const userPayload = {
    readme_excerpt: truncate(
      input.readme ?? '（無 README / no README）',
      8000,
    ),
    file_paths: pathsSample,
  }

  if (input.provider === 'ollama') {
    const body = {
      model: input.ollamaModel,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system' as const, content: SYSTEM },
        {
          role: 'user' as const,
          content: JSON.stringify(userPayload),
        },
      ],
    }
    const res = await fetch('/ollama/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(
        `Ollama 請求失敗（${res.status}）。請確認本機已執行 ollama serve。 / Ollama request failed (${res.status}). Ensure \`ollama serve\` is running.`,
      )
    }
    const json = (await res.json()) as { message?: { content?: string } }
    const text = json.message?.content ?? '{}'
    return parseLabelJson(text)
  }

  const key = input.openAiKey?.trim()
  if (!key) {
    throw new Error(
      '請在 .env 設定 VITE_OPENAI_API_KEY，或改用 Ollama。 / Set VITE_OPENAI_API_KEY in .env, or switch to Ollama.',
    )
  }

  const res = await fetch('/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: input.openAiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify(userPayload),
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(
      `OpenAI 錯誤 ${res.status}：${errText.slice(0, 200)} / OpenAI error ${res.status}: ${errText.slice(0, 200)}`,
    )
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content ?? '{}'
  return parseLabelJson(text)
}

function parseLabelJson(text: string): Record<string, SemanticCategory> {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      obj = JSON.parse(text.slice(start, end + 1))
    } else {
      throw new Error(
        '模型回傳無法解析為 JSON。 / Model response could not be parsed as JSON.',
      )
    }
  }
  const out: Record<string, SemanticCategory> = {}
  const raw = obj as { paths?: Record<string, string> }
  const paths = raw.paths
  if (!paths || typeof paths !== 'object') {
    return out
  }
  for (const [k, v] of Object.entries(paths)) {
    if (typeof v === 'string') {
      out[k] = normalizeCategory(v)
    }
  }
  return out
}
