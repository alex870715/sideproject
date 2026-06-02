export type SemanticCategory =
  | 'entry'
  | 'config'
  | 'business'
  | 'ui'
  | 'tests'
  | 'assets'
  | 'other'

export const CATEGORY_ORDER: SemanticCategory[] = [
  'entry',
  'business',
  'ui',
  'config',
  'tests',
  'assets',
  'other',
]

export const CATEGORY_STYLES: Record<
  SemanticCategory,
  { border: string; bg: string; label: string }
> = {
  entry: {
    border: 'border-emerald-500/80',
    bg: 'bg-emerald-500/15',
    label: '進入點 / Entry',
  },
  business: {
    border: 'border-sky-500/80',
    bg: 'bg-sky-500/15',
    label: '核心邏輯 / Core logic',
  },
  ui: {
    border: 'border-violet-500/80',
    bg: 'bg-violet-500/15',
    label: 'UI 介面 / UI',
  },
  config: {
    border: 'border-amber-500/80',
    bg: 'bg-amber-500/15',
    label: '設定 / Config',
  },
  tests: {
    border: 'border-rose-500/70',
    bg: 'bg-rose-500/12',
    label: '測試 / Tests',
  },
  assets: {
    border: 'border-stone-500/70',
    bg: 'bg-stone-500/12',
    label: '資源 / Assets',
  },
  other: {
    border: 'border-slate-500/50',
    bg: 'bg-slate-500/10',
    label: '其他 / Other',
  },
}

export function normalizeCategory(raw: string | undefined): SemanticCategory {
  const s = (raw ?? 'other').toLowerCase().replace(/\s+/g, '_')
  if (
    s === 'entry' ||
    s === 'entry_point' ||
    s === 'entrypoint' ||
    s === 'bootstrap'
  )
    return 'entry'
  if (s === 'config' || s === 'configuration' || s === 'tooling')
    return 'config'
  if (
    s === 'business' ||
    s === 'business_logic' ||
    s === 'core' ||
    s === 'domain'
  )
    return 'business'
  if (s === 'ui' || s === 'ui_components' || s === 'frontend' || s === 'view')
    return 'ui'
  if (s === 'tests' || s === 'test') return 'tests'
  if (s === 'assets' || s === 'static' || s === 'resources') return 'assets'
  return 'other'
}
