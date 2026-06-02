import type { ParsedRepo } from './parseGithubUrl'

export type GhTreeEntry = {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export type GhTreeResponse = {
  sha: string
  url: string
  tree: GhTreeEntry[]
  truncated: boolean
}

const GH_API = 'https://api.github.com'

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token?.trim()) {
    h.Authorization = `Bearer ${token.trim()}`
  }
  return h
}

export async function fetchReadmeText(
  parsed: ParsedRepo,
  token?: string,
): Promise<string | null> {
  const path = `${GH_API}/repos/${parsed.owner}/${parsed.repo}/readme`
  const res = await fetch(path, { headers: headers(token) })
  if (!res.ok) return null
  const data = (await res.json()) as { content?: string; encoding?: string }
  if (data.encoding === 'base64' && data.content) {
    const bin = atob(data.content.replace(/\n/g, ''))
    try {
      return decodeURIComponent(escape(bin))
    } catch {
      return bin
    }
  }
  return null
}

export async function fetchRecursiveTree(
  parsed: ParsedRepo,
  token?: string,
): Promise<{ tree: GhTreeResponse; branchUsed: string }> {
  const repoPath = `${GH_API}/repos/${parsed.owner}/${parsed.repo}`
  const repoRes = await fetch(repoPath, { headers: headers(token) })
  if (!repoRes.ok) {
    throw new Error(
      `無法讀取 Repository（${repoRes.status}）。請確認網址或 Token。 / Cannot fetch repository (${repoRes.status}). Check the URL or token.`,
    )
  }
  const repoJson = (await repoRes.json()) as { default_branch: string }
  const branch = parsed.branch ?? repoJson.default_branch

  const refPath = `${GH_API}/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${encodeURIComponent(branch)}`
  const refRes = await fetch(refPath, { headers: headers(token) })
  if (!refRes.ok) {
    throw new Error(
      `找不到分支「${branch}」（${refRes.status}）。 / Branch "${branch}" not found (${refRes.status}).`,
    )
  }
  const refJson = (await refRes.json()) as { object: { sha: string } }
  const commitSha = refJson.object.sha

  const commitPath = `${GH_API}/repos/${parsed.owner}/${parsed.repo}/git/commits/${commitSha}`
  const commitRes = await fetch(commitPath, { headers: headers(token) })
  if (!commitRes.ok) {
    throw new Error(
      `無法讀取 commit（${commitRes.status}）。 / Cannot fetch commit (${commitRes.status}).`,
    )
  }
  const commitJson = (await commitRes.json()) as { tree: { sha: string } }
  const treeSha = commitJson.tree.sha

  const treePath = `${GH_API}/repos/${parsed.owner}/${parsed.repo}/git/trees/${treeSha}?recursive=1`
  const treeRes = await fetch(treePath, { headers: headers(token) })
  if (!treeRes.ok) {
    throw new Error(
      `無法讀取檔案樹（${treeRes.status}）。 / Cannot fetch file tree (${treeRes.status}).`,
    )
  }
  const treeJson = (await treeRes.json()) as GhTreeResponse
  return { tree: treeJson, branchUsed: branch }
}
