'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { ResizableNodeFrame } from './resizable-node-frame'
import { SimpleNodeToolbar } from './node-toolbar'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { useBoardText, MAX_BOARD_TEXT_LENGTH } from '@/hooks/use-board-text'
import { useCurrentUser } from '@/hooks/use-current-user'
import { BOARD_COLORS, BOARD_COLOR_IDS, readBoardColor } from '@/lib/board-colors'

const STICKY_NOTE_BOUNDS = { minWidth: 140, minHeight: 100, maxWidth: 900, maxHeight: 900 }

export function BoardColorSwatches({ nodeId, value, kind }: { nodeId: string; value: string; kind: 'paper' | 'text' }) {
  const { patchNodeData } = useCanvasCollaboration()
  return (
    <div className="mx-1 flex items-center gap-1" role="radiogroup" aria-label="Color">
      {BOARD_COLOR_IDS.map((colorId) => (
        <button
          key={colorId}
          type="button"
          role="radio"
          aria-checked={value === colorId}
          aria-label={BOARD_COLORS[colorId].label}
          title={BOARD_COLORS[colorId].label}
          onClick={() => patchNodeData(nodeId, { color: colorId })}
          className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${value === colorId ? 'border-white ring-1 ring-white/70' : 'border-black/30'}`}
          style={{ background: BOARD_COLORS[colorId][kind] }}
        />
      ))}
    </div>
  )
}

// A sticky note: resizable paper with free text. Not connectable and not
// part of generation. Deleted only through the normal node delete.
function StickyNoteNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const user = useCurrentUser()
  const isNewByMe = !record.text && Boolean(user) && record.createdBy === user?.id
  const { text, editing, startEditing, stopEditing, change, canEdit } = useBoardText(id, record, { editOnMount: isNewByMe })
  const colorId = readBoardColor(record.color)
  const color = BOARD_COLORS[colorId]

  return (
    <ResizableNodeFrame
      nodeId={id}
      data={record}
      defaultSize={{ width: 220, height: 200 }}
      bounds={STICKY_NOTE_BOUNDS}
      className="group"
    >
      <SimpleNodeToolbar nodeId={id} selected={selected} locked={record.locked === true}>
        <BoardColorSwatches nodeId={id} value={colorId} kind="paper" />
      </SimpleNodeToolbar>
      <div
        className="absolute inset-0 overflow-hidden rounded-md shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
        style={{
          background: color.paper,
          color: color.ink,
          outline: selected ? '2px solid rgba(255,255,255,0.8)' : undefined,
          outlineOffset: 2,
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          void startEditing()
        }}
      >
        {editing ? (
          <textarea
            autoFocus
            aria-label="Sticky note text"
            value={text}
            maxLength={MAX_BOARD_TEXT_LENGTH}
            onChange={(event) => change(event.target.value)}
            onBlur={stopEditing}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') (event.currentTarget as HTMLTextAreaElement).blur()
            }}
            className="nodrag nopan nowheel h-full w-full resize-none bg-transparent p-3 text-[14px] leading-snug outline-none placeholder:opacity-50"
            style={{ color: color.ink }}
            placeholder="Type a note…"
          />
        ) : (
          <div
            className={`h-full w-full overflow-hidden whitespace-pre-wrap break-words p-3 text-[14px] leading-snug ${text ? '' : 'opacity-50'}`}
            title={canEdit ? 'Double-click to edit' : undefined}
          >
            {text || (canEdit ? 'Double-click to write…' : '')}
          </div>
        )}
      </div>
    </ResizableNodeFrame>
  )
}

export const StickyNoteNode = memo(StickyNoteNodeImpl)
StickyNoteNode.displayName = 'StickyNoteNode'
