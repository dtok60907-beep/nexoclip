'use client'

import { memo, useRef, useState, type PointerEvent } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import { TextB } from '@phosphor-icons/react'

import { SimpleNodeToolbar } from './node-toolbar'
import { BoardColorSwatches } from './sticky-note-node'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { useBoardText, MAX_BOARD_TEXT_LENGTH } from '@/hooks/use-board-text'
import { useCurrentUser } from '@/hooks/use-current-user'
import { BOARD_COLORS, readBoardColor } from '@/lib/board-colors'
import { MIN_TEXT_WIDTH as MIN_WIDTH, readFontSize, readTextSize, scaleTextLabel, type TextSize } from '@/lib/text-label-size'

const MAX_AUTO_WIDTH = 720
type Drag =
  | { kind: 'width'; startX: number; startWidth: number; zoom: number }
  | { kind: 'scale'; startX: number; fontSize: number; renderedWidth: number; width?: number; zoom: number }

// A borderless text label for titles and section headings. It grows with its
// text until given a width (drag the right edge), then wraps; dragging the
// corner scales the text itself.
function TextLabelNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const { patchNodeData } = useCanvasCollaboration()
  const { getZoom } = useReactFlow()
  const user = useCurrentUser()
  const isNewByMe = !record.text && Boolean(user) && record.createdBy === user?.id
  const { text, editing, startEditing, stopEditing, change, canEdit } = useBoardText(id, record, { editOnMount: isNewByMe })
  const size = readTextSize(record.size)
  const customSize = typeof record.fontSize === 'number'
  const bold = record.bold === true
  const colorId = readBoardColor(record.color, 'yellow')
  const color = record.color ? BOARD_COLORS[colorId].text : '#e2e8f0'
  const storedWidth = typeof record.width === 'number' ? record.width : undefined
  const dragRef = useRef<Drag | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Live size while a handle is dragged; written to the node on release.
  const [preview, setPreview] = useState<{ fontSize?: number; width?: number } | null>(null)
  const fontSize = preview?.fontSize ?? readFontSize(record)
  const width = preview && 'width' in preview ? preview.width : storedWidth

  const font = {
    fontSize,
    lineHeight: 1.2,
    fontWeight: bold ? 700 : 500,
    color,
  }

  const sizeFor = (drag: Drag, clientX: number) => drag.kind === 'width'
    ? { width: Math.round(Math.max(MIN_WIDTH, drag.startWidth + (clientX - drag.startX) / drag.zoom)) }
    : scaleTextLabel(drag, clientX - drag.startX, drag.zoom)

  const startDrag = (kind: Drag['kind']) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const renderedWidth = boxRef.current?.offsetWidth ?? storedWidth ?? 200
    const zoom = getZoom() || 1
    dragRef.current = kind === 'width'
      ? { kind, startX: event.clientX, startWidth: renderedWidth, zoom }
      : { kind, startX: event.clientX, fontSize: readFontSize(record), renderedWidth, width: storedWidth, zoom }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) setPreview(sizeFor(dragRef.current, event.clientX))
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setPreview(null)
    if (drag) patchNodeData(id, sizeFor(drag, event.clientX))
  }
  const cancelDrag = () => {
    dragRef.current = null
    setPreview(null)
  }

  const sizeButton = (value: TextSize, label: string) => (
    <button
      key={value}
      type="button"
      // A preset replaces any size set by dragging the corner.
      onClick={() => patchNodeData(id, { size: value, fontSize: undefined })}
      aria-pressed={!customSize && size === value}
      className={`h-6 min-w-6 rounded-md px-1 text-[10px] font-semibold ${!customSize && size === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
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

        {canEdit && !editing ? (
          <>
            <div
              className={`nodrag absolute -right-2 top-1/2 h-5 w-1.5 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-white/70 transition-opacity ${selected || preview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              onPointerDown={startDrag('width')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              title="Drag to set the width (text wraps)"
              aria-label="Resize width"
            />
            <div
              className={`nodrag absolute -bottom-2 -right-2 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-slate-900 bg-white transition-opacity ${selected || preview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              onPointerDown={startDrag('scale')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              title="Drag to resize the text"
              aria-label="Resize text"
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

export const TextLabelNode = memo(TextLabelNodeImpl)
TextLabelNode.displayName = 'TextLabelNode'
