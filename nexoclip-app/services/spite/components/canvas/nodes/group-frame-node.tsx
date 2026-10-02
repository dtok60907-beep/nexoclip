'use client'

import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BoundingBox, Trash } from '@phosphor-icons/react'

import { ResizableNodeFrame } from './resizable-node-frame'
import { SimpleNodeToolbar } from './node-toolbar'
import { BoardColorSwatches } from './sticky-note-node'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'
import { BOARD_COLORS, readBoardColor } from '@/lib/board-colors'
import { GROUP_HEADER } from '@/lib/canvas-groups'

const GROUP_BOUNDS = { minWidth: 160, minHeight: 120, maxWidth: 6000, maxHeight: 6000 }

// A named group frame. Its members are sub-flow children, so they move with
// it; locking it locks them. Deleting the frame keeps its members unless
// "Delete with contents" is used. Not connectable, not part of generation.
function GroupFrameNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const { patchNodeData, ungroupNodes, deleteNodes, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const label = typeof record.label === 'string' && record.label.trim() ? record.label : 'Group'
  const colorId = readBoardColor(record.color, 'blue')
  const accent = BOARD_COLORS[colorId].text
  const locked = record.locked === true
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(label)
  useEffect(() => { if (!renaming) setDraft(label) }, [label, renaming])

  const commitRename = () => {
    setRenaming(false)
    const next = draft.trim().slice(0, 120)
    if (next && next !== label) patchNodeData(id, { label: next })
  }

  return (
    <ResizableNodeFrame
      nodeId={id}
      data={record}
      defaultSize={{ width: 480, height: 320 }}
      bounds={GROUP_BOUNDS}
      className="group"
    >
      <SimpleNodeToolbar nodeId={id} selected={selected} locked={locked}>
        <button
          type="button"
          onClick={() => ungroupNodes([id])}
          className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
          title="Ungroup (Ctrl+Shift+G)"
        >
          <BoundingBox size={13} /> Ungroup
        </button>
        <button
          type="button"
          onClick={() => deleteNodes([id], { withContents: true })}
          className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-red-300 hover:bg-red-500/20"
          title="Delete the group and everything in it"
        >
          <Trash size={13} /> With contents
        </button>
        <BoardColorSwatches nodeId={id} value={colorId} kind="text" />
      </SimpleNodeToolbar>

      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: `color-mix(in srgb, ${accent} 7%, transparent)`,
          border: `1.5px ${selected ? 'solid' : 'dashed'} color-mix(in srgb, ${accent} ${selected ? 85 : 45}%, transparent)`,
        }}
      >
        <div
          className="flex items-center gap-2 px-3"
          style={{ height: GROUP_HEADER }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            if (allowDocumentMutation && !locked) setRenaming(true)
          }}
        >
          {renaming ? (
            <input
              autoFocus
              value={draft}
              maxLength={120}
              aria-label="Group name"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') { setDraft(label); setRenaming(false) }
              }}
              className="nodrag nopan w-56 rounded-md border border-white/15 bg-black/40 px-2 py-0.5 text-[13px] font-semibold text-white outline-none"
            />
          ) : (
            <span className="truncate text-[13px] font-semibold" style={{ color: accent }} title={allowDocumentMutation ? 'Double-click to rename' : undefined}>
              {label}
            </span>
          )}
        </div>
      </div>
    </ResizableNodeFrame>
  )
}

export const GroupFrameNode = memo(GroupFrameNodeImpl)
GroupFrameNode.displayName = 'GroupFrameNode'
