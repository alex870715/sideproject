export type ParsedRepo = {
  owner: string
  repo: string
  /** 若 URL 含 /tree/branch/… 則解析分支名稱 · Branch name when URL contains `/tree/<branch>/…` */
  branch?: string
}

const RESERVED_FIRST = new Set([
  'settings',
  'topics',
  'collections',
  'explore',
  'marketplace',
  'pricing',
  'login',
  'signup',
  'features',
])

export function parseGithubInput(input: string): ParsedRepo | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let owner: string
  let repo: string
  let branch: string | undefined

  try {
    if (trimmed.includes('github.com')) {
      const u = new URL(
        trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      )
      if (!u.hostname.endsWith('github.com')) return null
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length < 2) return null
      owner = parts[0]
      repo = parts[1].replace(/\.git$/, '')
      const treeIdx = parts.indexOf('tree')
      if (treeIdx >= 0 && parts[treeIdx + 1]) {
        branch = decodeURIComponent(parts[treeIdx + 1])
      }
    } else if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
      const parts = trimmed.split('/')
      owner = parts[0]
      repo = parts[1].replace(/\.git$/, '')
    } else {
      return null
    }
  } catch {
    return null
  }

  if (!owner || !repo || RESERVED_FIRST.has(owner.toLowerCase())) return null
  return { owner, repo, branch }
}
