import { useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { RepoNode } from './RepoNode'
import { fileTreeToFlowElements } from '../lib/treeToFlow'
import type { FileTreeNode } from '../lib/fileTree'
import type { SemanticCategory } from '../lib/category'
import type { FlowNodeData } from '../lib/treeToFlow'

const nodeTypes: NodeTypes = { repoNode: RepoNode }

type Props = {
  tree: FileTreeNode
  labels: Record<string, SemanticCategory>
}

/** nodes 更新後重新對準視窗（RF 的 fitView 僅在初次掛載可靠）· Re-fit after graph updates (fitView prop is mainly reliable on first mount) */
function FitViewOnGraphChange({
  nodes,
  edges,
}: {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
}) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (nodes.length === 0) return
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 })
    })
    return () => cancelAnimationFrame(id)
  }, [nodes.length, edges.length, fitView])
  return null
}

export function FlowCanvas({ tree, labels }: Props) {
  const { nodes, edges } = useMemo(
    () => fileTreeToFlowElements(tree, labels),
    [tree, labels],
  )

  const defaultEdgeOptions = useMemo(
    () => ({ style: { strokeWidth: 1 } }),
    [],
  )

  return (
    <div
      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40"
      style={{ height: 'min(75vh, 800px)', minHeight: 420 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.08}
        maxZoom={1.6}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnGraphChange nodes={nodes} edges={edges} />
        <MiniMap
          zoomable
          pannable
          className="!bg-slate-950/30 dark:!bg-slate-800/50"
        />
        <Controls className="!bg-white/90 dark:!bg-slate-900/90" />
        <Background gap={16} size={1} color="#cbd5e11a" />
      </ReactFlow>
    </div>
  )
}
