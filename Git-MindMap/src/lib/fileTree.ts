import type { GhTreeEntry } from './github'

export type FileTreeNode = {
  id: string
  name: string
  path: string
  isFile: boolean
  children: Map<string, FileTreeNode>
}

export function emptyRoot(repoLabel: string): FileTreeNode {
  return {
    id: '__root__',
    name: repoLabel,
    path: '',
    isFile: false,
    children: new Map(),
  }
}

function ensureChild(
  parent: FileTreeNode,
  name: string,
  fullPath: string,
  isFile: boolean,
): FileTreeNode {
  const existing = parent.children.get(name)
  if (existing) {
    if (isFile) existing.isFile = true
    return existing
  }
  const node: FileTreeNode = {
    id: fullPath || name,
    name,
    path: fullPath,
    isFile,
    children: new Map(),
  }
  parent.children.set(name, node)
  return node
}

/**
 * 從 GitHub recursive tree 建立資料夾／檔案階層（僅 blob；略過 submodule 等）
 * Build folder/file hierarchy from GitHub recursive tree (blobs only; skips submodules, etc.)
 */
export function buildFileTreeFromGithub(
  entries: GhTreeEntry[],
  repoLabel: string,
): FileTreeNode {
  const root = emptyRoot(repoLabel)
  for (const e of entries) {
    if (e.type !== 'blob') continue
    const parts = e.path.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let parent = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      acc = acc ? `${acc}/${seg}` : seg
      const isLast = i === parts.length - 1
      parent = ensureChild(parent, seg, acc, isLast)
    }
  }
  return root
}

export function countNodes(root: FileTreeNode): number {
  let n = 1
  for (const c of root.children.values()) {
    n += countNodes(c)
  }
  return n
}

export function collectFilePaths(root: FileTreeNode): string[] {
  const out: string[] = []
  function dfs(n: FileTreeNode) {
    if (n.id === '__root__') {
      for (const c of n.children.values()) dfs(c)
      return
    }
    if (n.isFile && n.children.size === 0) {
      out.push(n.path)
      return
    }
    for (const c of n.children.values()) dfs(c)
  }
  dfs(root)
  return out.sort((a, b) => a.localeCompare(b))
}

/**
 * 限制深度與總節點數，避免超大型 repo 卡死版面
 * Cap depth and node count so huge repos don’t freeze the layout
 */
export function cloneTreeLimited(
  root: FileTreeNode,
  maxDepth: number,
  maxNodes: number,
): { root: FileTreeNode; truncated: boolean } {
  let used = 0
  let truncated = false

  function sortedEntries(node: FileTreeNode) {
    return [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b))
  }

  function walk(node: FileTreeNode, depth: number): FileTreeNode | null {
    if (used >= maxNodes) {
      truncated = true
      return null
    }
    used += 1

    if (node.id === '__root__') {
      const next = emptyRoot(node.name)
      for (const [k, ch] of sortedEntries(node)) {
        const sub = walk(ch, 0)
        if (sub) next.children.set(k, sub)
      }
      return next
    }

    if (depth >= maxDepth) {
      truncated = true
      return {
        id: node.id,
        name: node.name,
        path: node.path,
        isFile: node.isFile,
        children: new Map(),
      }
    }

    const copy: FileTreeNode = {
      id: node.id,
      name: node.name,
      path: node.path,
      isFile: node.isFile,
      children: new Map(),
    }
    for (const [k, ch] of sortedEntries(node)) {
      const sub = walk(ch, depth + 1)
      if (sub) copy.children.set(k, sub)
    }
    return copy
  }

  const out = walk(root, 0)
  if (!out) {
    return { root: emptyRoot(root.name), truncated: true }
  }
  return { root: out, truncated }
}
