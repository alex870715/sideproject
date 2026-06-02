import dagre from 'dagre'
import type { Edge, Node } from 'reactflow'
import type { SemanticCategory } from './category'
import type { FileTreeNode } from './fileTree'

export type FlowNodeData = {
  label: string
  path: string
  isFile: boolean
  category: SemanticCategory
}

const NODE_W = 200
const NODE_H_FOLDER = 36
const NODE_H_FILE = 32

function nodeHeight(isFile: boolean) {
  return isFile ? NODE_H_FILE : NODE_H_FOLDER
}

/**
 * 將檔案樹轉成 React Flow 節點與邊，並以 dagre 做左右（LR）排版
 * Turn a file tree into React Flow nodes/edges; layout with dagre (left-to-right).
 */
export function fileTreeToFlowElements(
  root: FileTreeNode,
  labels: Record<string, SemanticCategory>,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = []
  const edges: Edge[] = []

  function categoryForPath(path: string, isFile: boolean): SemanticCategory {
    if (!isFile) return 'other'
    return labels[path] ?? 'other'
  }

  function visit(parentId: string | null, node: FileTreeNode) {
    const isRoot = node.id === '__root__'
    const category = isRoot
      ? 'other'
      : categoryForPath(node.path, node.isFile)
    const rfNode: Node<FlowNodeData> = {
      id: node.id,
      type: 'repoNode',
      position: { x: 0, y: 0 },
      data: {
        label: node.name,
        path: node.path,
        isFile: node.isFile,
        category,
      },
    }
    nodes.push(rfNode)
    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        source: parentId,
        target: node.id,
        animated: false,
        style: { stroke: 'var(--edge, #94a3b8)', strokeWidth: 1 },
      })
    }
    const children = [...node.children.values()].sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
      return a.name.localeCompare(b.name)
    })
    for (const ch of children) {
      visit(node.id, ch)
    }
  }

  visit(null, root)

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    nodesep: 28,
    ranksep: 72,
    marginx: 20,
    marginy: 20,
  })

  for (const n of nodes) {
    const h = nodeHeight(n.data.isFile)
    g.setNode(n.id, { width: NODE_W, height: h })
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target)
  }
  dagre.layout(g)

  for (const n of nodes) {
    const laid = g.node(n.id)
    if (laid) {
      const h = nodeHeight(n.data.isFile)
      n.position = {
        x: laid.x - NODE_W / 2,
        y: laid.y - h / 2,
      }
    }
  }

  return { nodes, edges }
}
