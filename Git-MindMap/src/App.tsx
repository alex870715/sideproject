import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { FlowCanvas } from './components/FlowCanvas'
import {
  buildFileTreeFromGithub,
  cloneTreeLimited,
  collectFilePaths,
  countNodes,
  type FileTreeNode,
} from './lib/fileTree'
import {
  fetchReadmeText,
  fetchRecursiveTree,
  type GhTreeEntry,
} from './lib/github'
import { parseGithubInput } from './lib/parseGithubUrl'
import { runSemanticLabeling, type AiProvider } from './lib/aiLabeling'
import type { SemanticCategory } from './lib/category'
import { CATEGORY_ORDER, CATEGORY_STYLES } from './lib/category'

/** 視覺化節點上限（避免超大 repo 卡頓）· Max nodes cap (keeps huge repos responsive) */
const MAX_TOTAL_NODES = 520
/** 目錄樹深度上限 · Max directory depth */
const MAX_DEPTH = 8

function readRepoQuery(): string {
  const q = new URLSearchParams(window.location.search).get('repo')
  return q ? decodeURIComponent(q.trim()) : ''
}

function initialUrlInput(): string {
  const fromQuery = readRepoQuery()
  if (fromQuery) {
    if (fromQuery.includes('/')) return `https://github.com/${fromQuery.replace(/^\/+/, '')}`
    return fromQuery
  }
  return 'https://github.com/facebook/react'
}

export default function App() {
  const [urlInput, setUrlInput] = useState(initialUrlInput)
  const [token, setToken] = useState(
    () => import.meta.env.VITE_GITHUB_TOKEN?.trim() ?? '',
  )
  const [branchLabel, setBranchLabel] = useState<string>('')
  const [rawEntries, setRawEntries] = useState<GhTreeEntry[]>([])
  const [apiTreeTruncated, setApiTreeTruncated] = useState(false)
  const [readme, setReadme] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, SemanticCategory>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai')
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-mini')
  const [ollamaModel, setOllamaModel] = useState('llama3.2')

  const parsed = useMemo(() => parseGithubInput(urlInput), [urlInput])

  const loadTree = useCallback(async () => {
    setError(null)
    setLabels({})
    if (!parsed) {
      setError(
        '請輸入有效的 GitHub 網址（例：https://github.com/owner/repo）。 / Enter a valid GitHub URL (e.g. https://github.com/owner/repo).',
      )
      return
    }
    setLoading(true)
    try {
      const [{ tree, branchUsed }, readmeText] = await Promise.all([
        fetchRecursiveTree(parsed, token || undefined),
        fetchReadmeText(parsed, token || undefined),
      ])
      setBranchLabel(branchUsed)
      setReadme(readmeText)
      setRawEntries(Array.isArray(tree.tree) ? tree.tree : [])
      setApiTreeTruncated(tree.truncated)
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?repo=${encodeURIComponent(`${parsed.owner}/${parsed.repo}`)}`,
      )
    } catch (e) {
      setRawEntries([])
      setApiTreeTruncated(false)
      setError(
        e instanceof Error
          ? e.message
          : '載入失敗。 / Failed to load.',
      )
    } finally {
      setLoading(false)
    }
  }, [parsed, token])

  const loadTreeRef = useRef(loadTree)
  useEffect(() => {
    loadTreeRef.current = loadTree
  }, [loadTree])

  /** URL 含 ?repo=owner/repo 時於掛載後自動載入（例如擴充開啟）· Auto-load when opened with ?repo= */
  useEffect(() => {
    if (!readRepoQuery().includes('/')) return
    const id = window.setTimeout(() => {
      void loadTreeRef.current()
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  const { tree, truncated } = useMemo(() => {
    if (rawEntries.length === 0 || !parsed) {
      return { tree: null as FileTreeNode | null, truncated: false }
    }
    const label = `${parsed.owner}/${parsed.repo}`
    const full = buildFileTreeFromGithub(rawEntries, label)
    const total = countNodes(full)
    if (total > MAX_TOTAL_NODES) {
      const { root, truncated: t } = cloneTreeLimited(
        full,
        MAX_DEPTH,
        MAX_TOTAL_NODES,
      )
      return { tree: root, truncated: t || apiTreeTruncated }
    }
    return { tree: full, truncated: apiTreeTruncated }
  }, [rawEntries, parsed, apiTreeTruncated])

  const runAi = useCallback(async () => {
    if (!tree || !parsed) return
    setAiLoading(true)
    setError(null)
    try {
      const paths = collectFilePaths(tree)
      if (paths.length === 0) {
        throw new Error(
          '沒有可標註的檔案（可能皆被裁切）。 / No files to label (tree may be truncated).',
        )
      }
      const next = await runSemanticLabeling({
        readme,
        filePaths: paths,
        provider: aiProvider,
        openAiModel,
        ollamaModel,
        openAiKey: import.meta.env.VITE_OPENAI_API_KEY,
      })
      setLabels(next)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'AI 標註失敗。 / AI labeling failed.',
      )
    } finally {
      setAiLoading(false)
    }
  }, [tree, parsed, readme, aiProvider, openAiModel, ollamaModel])

  const legend = (
    <div className="flex flex-wrap gap-2 text-[11px] leading-tight text-slate-600 dark:text-slate-300">
      {CATEGORY_ORDER.map((k) => (
        <span
          key={k}
          className={`inline-flex max-w-[200px] items-center gap-1 rounded-full border px-2 py-0.5 ${CATEGORY_STYLES[k].border} ${CATEGORY_STYLES[k].bg}`}
        >
          {CATEGORY_STYLES[k].label}
        </span>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200/80 bg-white/70 px-4 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/70 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              GitMind-Map
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              <span className="block">
                將 GitHub Repository 轉成可縮放的檔案樹圖；可選用 LLM
                依 README 與路徑做語意著色（進入點、核心邏輯、UI…）。
              </span>
              <span className="mt-1 block">
                Turn any GitHub repo into a zoomable file tree; optionally use an
                LLM to color paths by role (entry, core logic, UI, etc.) from the
                README and file list.
              </span>
            </p>
          </div>
          {legend}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:px-8">
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>
              GitHub 網址或 owner/repo · GitHub URL or{' '}
              <code className="rounded bg-slate-200/80 px-1 text-xs dark:bg-slate-800">
                owner/repo
              </code>
            </span>
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 shadow-inner outline-none ring-violet-500/40 placeholder:text-slate-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              placeholder="https://github.com/vitejs/vite"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>
              GitHub Token（選填，提升 API 配額）· Optional token (higher API rate
              limit)
            </span>
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none ring-violet-500/40 focus:ring-2 dark:border-slate-600 dark:bg-slate-950"
              placeholder="ghp_… · or set VITE_GITHUB_TOKEN in .env"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-500 disabled:opacity-50"
              onClick={loadTree}
              disabled={loading || !parsed}
            >
              {loading
                ? '載入中… / Loading…'
                : '載入檔案樹 / Load file tree'}
            </button>
            {parsed ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {parsed.owner}/{parsed.repo}
                {branchLabel
                  ? ` · 分支 / branch · ${branchLabel}`
                  : ''}
              </span>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            AI 語意標註 · AI semantic labels
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-300">
                提供者 · Provider
              </span>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950"
                value={aiProvider}
                onChange={(e) =>
                  setAiProvider(e.target.value === 'ollama' ? 'ollama' : 'openai')
                }
              >
                <option value="openai">
                  OpenAI（dev proxy）· OpenAI (dev proxy)
                </option>
                <option value="ollama">Ollama 本機 · Ollama local</option>
              </select>
            </label>
            {aiProvider === 'openai' ? (
              <label className="inline-flex items-center gap-2">
                模型 · Model
                <input
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950"
                  value={openAiModel}
                  onChange={(e) => setOpenAiModel(e.target.value)}
                />
              </label>
            ) : (
              <label className="inline-flex items-center gap-2">
                模型 · Model
                <input
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-950"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                />
              </label>
            )}
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
              disabled={!tree || aiLoading}
              onClick={runAi}
            >
              {aiLoading
                ? '分析中… / Analyzing…'
                : '執行標註 / Run labeling'}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="block">
              OpenAI：在專案根目錄設定{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                VITE_OPENAI_API_KEY
              </code>
              ，以{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                npm run dev
              </code>{' '}
              啟動（Vite 會轉發至 api.openai.com）。
            </span>
            <span className="mt-1 block">
              OpenAI: set{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                VITE_OPENAI_API_KEY
              </code>{' '}
              and run{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                npm run dev
              </code>{' '}
              (Vite proxies to api.openai.com in development).
            </span>
            <span className="mt-1 block">
              Ollama：先執行{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                ollama serve
              </code>
              。 · Ollama: run{' '}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-800">
                ollama serve
              </code>{' '}
              first.
            </span>
          </p>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {truncated ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="block">
              此 repo 節點過多，已套用深度上限 {MAX_DEPTH} 與約 {MAX_TOTAL_NODES}{' '}
              個節點的上限，以避免畫面卡死。可改用小專案測試，或後續改後端彙總。
            </span>
            <span className="mt-1 block">
              This repository has too many nodes; depth is capped at {MAX_DEPTH}{' '}
              and about {MAX_TOTAL_NODES} nodes so the UI stays responsive. Try a
              smaller repo or move summarization to a backend later.
            </span>
          </div>
        ) : null}

        <div className="min-h-[480px] flex-1">
          {tree ? (
            <ReactFlowProvider>
              <FlowCanvas tree={tree} labels={labels} />
            </ReactFlowProvider>
          ) : (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>請點「載入檔案樹」，或使用 <code className="rounded bg-slate-200/80 px-1 text-xs dark:bg-slate-800">?repo=owner/repo</code> 開啟以自動載入。</span>
              <span>Click “Load file tree”, or open with <code className="rounded bg-slate-200/80 px-1 text-xs dark:bg-slate-800">?repo=owner/repo</code> to auto-load.</span>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
        <span className="block">
          GitMind-Map — Repository 結構可視化與語意標註（side project）
        </span>
        <span className="mt-0.5 block">
          Repo structure visualization & semantic labeling (side project)
        </span>
      </footer>
    </div>
  )
}
