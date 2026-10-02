'use client'

import { memo, useRef, type PointerEvent } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import { TextB } from '@phosphor-icons/react'

import { SimpleNodeToolbar } from './node-toolbar'
import { BoardColorSwatches } from './sticky-note-node'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { useBoardText, MAX_BOARD_TEXT_LENGTH } from '@/hooks/use-board-text'
import { useCurrentUser } from '@/hooks/use-current-user'
import { BOARD_COLORS, readBoardColor } from '@/lib/board-colors'

export const TEXT_SIZES = { s: 14, m: 20, l: 32, xl: 48 } as const
type TextSize = keyof typeof TEXT_SIZES
const MAX_AUTO_WIDTH = 720
const MIN_WIDTH = 60

function readSize(value: unknown): TextSize {
  return typeof value === 'string' && value in TEXT_SIZES ? value as TextSize : 'm'
}

// A borderless text label for titles and section headings. It grows with its
// text until given a width (drag the right edge), then wraps.
function TextLabelNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const { patchNodeData } = useCanvasCollaboration()
  const { getZoom } = useReactFlow()
  const user = useCurrentUser()
  const isNewByMe = !record.text && Boolean(user) && record.createdBy === user?.id
  const { text, editing, startEditing, stopEditing, change, canEdit } = useBoardText(id, record, { editOnMount: isNewByMe })
  const size = readSize(record.size)
  const bold = record.bold === true
  const colorId = readBoardColor(record.color, 'yellow')
  const color = record.color ? BOARD_COLORS[colorId].text : '#e2e8f0'
  const width = typeof record.width === 'number' ? record.width : undefined
  const resizeRef = useRef<{ startX: number; startWidth: number; zoom: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const font = {
    fontSize: TEXT_SIZES[size],
    lineHeight: 1.2,
    fontWeight: bold ? 700 : 500,
    color,
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { startX: event.clientX, startWidth: boxRef.current?.offsetWidth ?? width ?? 200, zoom: getZoom() || 1 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current
    if (!start || !boxRef.current) return
    boxRef.current.style.width = `${Math.max(MIN_WIDTH, start.startWidth + (event.clientX - start.startX) / start.zoom)}px`
  }
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current
    resizeRef.current = null
    if (!start) return
    const next = Math.round(Math.max(MIN_WIDTH, start.startWidth + (event.clientX - start.startX) / start.zoom))
    patchNodeData(id, { width: next })
  }

  const sizeButton = (value: TextSize, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => patchNodeData(id, { size: value })}
      aria-pressed={size === value}
      className={`h-6 min-w-6 rounded-md px-1 text-[10px] font-semibold ${size === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
      title={`Size ${label}`}
    >
      {label}
    </button>
  )

  return (
    <div className="group relative">
      <SimpleNodeToolbar nodeId={id} selected={selected} locked={record.locked === true}>
        <div className="mx-1 flex items-center gap-0.5">
          {sizeButton('s', 'S')}{sizeButton('m', 'M')}{sizeButton('l', 'L')}{sizeButton('xl', 'XL')}
          <button
            type="button"
            onClick={() => patchNodeData(id, { bold: !bold })}
            aria-pressed={bold}
            className={`flex h-6 w-6 items-center justify-center rounded-md ${bold ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
            title="Bold"
            aria-label="Bold"
          >
            <TextB size={13} weight="bold" />
          </button>
        </div>
        <BoardColorSwatches nodeId={id} value={record.color ? colorId : ''} kind="text" />
      </SimpleNodeToolbar>

      <div
        ref={boxRef}
        className="relative rounded px-1"
        style={{
          width: width ?? 'max-content',
          maxWidth: width ? undefined : MAX_AUTO_WIDTH,
          minWidth: MIN_WIDTH,
          outline: selected ? '1px dashed rgba(255,255,255,0.45)' : undefined,
          outlineOffset: 4,
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          void startEditing()
        }}
      >
        {/* Auto-growing editor: the hidden copy sizes the grid cell the
            textarea fills, so the label grows as you type. */}
        <div className="grid">
          <div aria-hidden={editing} className={`col-start-1 row-start-1 whitespace-pre-wrap break-words ${editing ? 'invisible' : ''} ${text ? '' : 'opacity-40'}`} style={font} title={canEdit && !editing ? 'Double-click to edit' : undefined}>
            {(text || (canEdit ? 'Text' : '')) + (editing ? ' ' : '')}
          </div>
          {editing ? (
            <textarea
              autoFocus
              aria-label="Text"
              value={text}
              maxLength={MAX_BOARD_TEXT_LENGTH}
              rows={1}
              onChange={(event) => change(event.target.value)}
              onBlur={stopEditing}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') (event.currentTarget as HTMLTextAreaElement).blur()
              }}
              className="nodrag nopan nowheel col-start-1 row-start-1 resize-none overflow-hidden bg-transparent p-0 outline-none"
              style={font}
            />
          ) : null}
        </div>

        {selected && canEdit ? (
          <div
            className="nodrag absolute -right-1.5 top-1/2 h-4 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full bg-white/70"
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={finishResize}
            onPointerCancel={() => { resizeRef.current = null }}
            title="Drag to set the width"
            aria-label="Resize width"
          />
        ) : null}
      </div>
    </div>
  )
}

export const TextLabelNode = memo(TextLabelNodeImpl)
TextLabelNode.displayName = 'TextLabelNode'
