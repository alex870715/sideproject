import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { FlowNodeData } from '../lib/treeToFlow'
import { CATEGORY_STYLES } from '../lib/category'

function RepoNodeInner({ data }: NodeProps<FlowNodeData>) {
  const st = CATEGORY_STYLES[data.category]
  return (
    <div
      className={`min-w-[160px] max-w-[220px] rounded-lg border px-2 py-1 shadow-sm backdrop-blur-sm ${st.border} ${st.bg} text-left dark:text-slate-100`}
      title={data.path || data.label}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="flex flex-col gap-0.5">
        <span className="truncate text-[11px] font-medium opacity-70">
          {data.isFile ? st.label : '資料夾 / Folder'}
        </span>
        <span className="truncate text-[13px] font-semibold leading-tight">
          {data.label}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400"
      />
    </div>
  )
}

export const RepoNode = memo(RepoNodeInner)
