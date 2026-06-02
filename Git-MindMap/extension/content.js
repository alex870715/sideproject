/** 預設指向本機 Vite；可於擴充選項頁覆寫 · Default local Vite URL; override in extension options */
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173'

/** pathname 第一段若為此集合，代表非一般 owner/repo 頁 · First path segment to ignore for repo pages */
const SKIP_OWNER = new Set([
  'settings',
  'organizations',
  'marketplace',
  'explore',
  'topics',
  'collections',
  'enterprise',
  'customer-stories',
  'readme',
  'features',
  'team',
  'sponsors',
])

/** 從 location.pathname 解析 owner／repo（僅供擴充按鈕用）· Parse owner/repo from the path (for the extension button) */
function parseOwnerRepo() {
  const parts = location.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const [owner, repo] = parts
  if (SKIP_OWNER.has(owner)) return null
  if (!repo || repo.startsWith('.')) return null
  const cleanRepo = repo.replace(/\.git$/, '')
  return { owner, repo: cleanRepo }
}

/** 在 GitHub 頁面插入「開啟 GitMind-Map」連結 · Inject link to open GitMind-Map on github.com */
function mountButton(origin) {
  if (document.getElementById('gitmind-map-visualize-btn')) return

  const parsed = parseOwnerRepo()
  if (!parsed) return

  const target =
    document.querySelector('#repository-container-header') ||
    document.querySelector('main .flex-md-items-center') ||
    document.body

  const a = document.createElement('a')
  a.id = 'gitmind-map-visualize-btn'
  a.textContent = 'Visualize · GitMind-Map'
  a.href = `${origin.replace(/\/$/, '')}/?repo=${encodeURIComponent(`${parsed.owner}/${parsed.repo}`)}`
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'margin-left:8px',
    'padding:4px 10px',
    'border-radius:999px',
    'font:600 12px/1.4 system-ui,-apple-system,sans-serif',
    'text-decoration:none',
    'color:#fff',
    'background:linear-gradient(135deg,#7c3aed,#4d46e5)',
    'box-shadow:0 1px 2px rgba(0,0,0,.12)',
    'border:1px solid rgba(255,255,255,.2)',
  ].join(';')

  const wrap = document.createElement('span')
  wrap.style.cssText = 'display:inline-flex;align-items:center;'
  wrap.appendChild(a)

  if (target === document.body) {
    wrap.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:99999;padding:8px;background:rgba(15,23,42,.35);border-radius:12px;backdrop-filter:blur(6px);'
    target.appendChild(wrap)
  } else if (target instanceof HTMLElement) {
    target.style.position = target.style.position || 'relative'
    const bar = target.querySelector('[class*="flex"]') || target
    if (bar instanceof HTMLElement) {
      bar.appendChild(wrap)
    } else {
      target.appendChild(wrap)
    }
  }
}

chrome.storage.sync.get(['appOrigin'], (r) => {
  const origin = (r.appOrigin || DEFAULT_ORIGIN).trim() || DEFAULT_ORIGIN
  mountButton(origin)

  const obs = new MutationObserver(() => {
    if (!document.getElementById('gitmind-map-visualize-btn')) {
      mountButton(origin)
    }
  })
  obs.observe(document.documentElement, { childList: true, subtree: true })
})
