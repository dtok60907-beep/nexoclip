'use client'

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Columns, Rows, Table as TableIcon } from '@phosphor-icons/react'

import { ResizableNodeFrame } from './resizable-node-frame'
import { SimpleNodeToolbar } from './node-toolbar'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'
import {
  MAX_CELL_LENGTH,
  addColumn,
  addRow,
  readTable,
  removeColumn,
  removeRow,
  setCell,
  setHeader,
} from '@/lib/table-data'

const TABLE_BOUNDS = { minWidth: 220, minHeight: 120, maxWidth: 3000, maxHeight: 3000 }
type Focus = { rowId: string | null; columnId: string }

// One cell. Keeps its own draft while focused so a collaborator's update
// doesn't move the caret; otherwise it shows the stored value.
function Cell({ value, header, disabled, onChange, onFocus, onKeyDown, cellRef }: {
  value: string
  header?: boolean
  disabled: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  cellRef: (element: HTMLTextAreaElement | null) => void
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(value) }, [value])
  return (
    <textarea
      ref={cellRef}
      rows={1}
      value={draft}
      disabled={disabled}
      maxLength={MAX_CELL_LENGTH}
      onFocus={() => { focused.current = true; onFocus() }}
      onBlur={() => { focused.current = false; setDraft(value) }}
      onChange={(event) => { setDraft(event.target.value); onChange(event.target.value) }}
      onKeyDown={onKeyDown}
      className={`nodrag nopan nowheel block h-full min-h-[30px] w-full resize-none bg-transparent px-2 py-1.5 text-[12px] leading-snug outline-none focus:bg-white/[0.06] ${header ? 'font-semibold text-slate-100' : 'text-slate-200'} disabled:cursor-default`}
    />
  )
}

// A free-form table: editable header and cells, rows and columns added or
// removed from the toolbar. Not connectable, not part of generation.
function TableNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const { patchNodeData, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const disabled = !allowDocumentMutation || record.locked === true
  const table = useMemo(() => readTable(record), [record])
  const [focus, setFocus] = useState<Focus | null>(null)
  const cells = useRef(new Map<string, HTMLTextAreaElement>())
  const key = (rowId: string | null, columnId: string) => `${rowId ?? 'head'}:${columnId}`

  const apply = (patch: Record<string, unknown> | null) => { if (patch) patchNodeData(id, patch) }

  // Enter moves down a row (Shift+Enter is a newline); Esc leaves the cell.
  const handleKeyDown = (rowId: string | null, columnId: string) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') event.currentTarget.blur()
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      const rowIndex = rowId === null ? -1 : table.rowIds.indexOf(rowId)
      const nextRow = table.rowIds[rowIndex + 1]
      if (nextRow) cells.current.get(key(nextRow, columnId))?.focus()
    }
  }

  const focusedRow = focus?.rowId ?? table.rowIds[table.rowIds.length - 1]
  const focusedColumn = focus?.columnId ?? table.columnIds[table.columnIds.length - 1]
  const toolButton = (label: string, title: string, icon: ReactNode, onClick: () => void, enabled = true) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled || disabled}
      className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
      title={title}
    >
      {icon}{label}
    </button>
  )

  return (
    <ResizableNodeFrame nodeId={id} data={record} defaultSize={{ width: 480, height: 200 }} bounds={TABLE_BOUNDS} className="group">
      <SimpleNodeToolbar nodeId={id} selected={selected} locked={record.locked === true}>
        {toolButton('+ Row', 'Add a row below the selected cell', <Rows size={13} />, () => apply(addRow(table, focusedRow)))}
        {toolButton('+ Col', 'Add a column after the selected cell', <Columns size={13} />, () => apply(addColumn(table, focusedColumn)))}
        {toolButton('− Row', 'Remove the selected row', <Rows size={13} />, () => { apply(removeRow(table, focusedRow)); setFocus(null) }, table.rowIds.length > 1)}
        {toolButton('− Col', 'Remove the selected column', <Columns size={13} />, () => { apply(removeColumn(table, focusedColumn)); setFocus(null) }, table.columnIds.length > 1)}
      </SimpleNodeToolbar>

      <div
        className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border bg-[#15171d]"
        style={{ borderColor: selected ? 'rgba(148,163,184,0.7)' : 'rgba(255,255,255,0.1)' }}
      >
        {/* Drag handle: the cells themselves are text inputs. */}
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-white/[0.08] px-2.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
          <TableIcon size={11} /> {typeof record.label === 'string' && record.label ? record.label : 'Table'}
        </div>
        <div className="nowheel min-h-0 flex-1 overflow-auto">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, table.columnIds.length)}, minmax(90px, 1fr))` }}>
            {table.columnIds.map((columnId) => (
              <div key={`h-${columnId}`} className={`border-b border-r border-white/[0.1] bg-white/[0.04] ${focus?.columnId === columnId && focus.rowId === null ? 'ring-1 ring-inset ring-sky-400/60' : ''}`}>
                <Cell
                  header
                  value={table.header(columnId)}
                  disabled={disabled}
                  cellRef={(element) => { if (element) cells.current.set(key(null, columnId), element); else cells.current.delete(key(null, columnId)) }}
                  onFocus={() => setFocus({ rowId: null, columnId })}
                  onChange={(value) => apply(setHeader(columnId, value))}
                  onKeyDown={handleKeyDown(null, columnId)}
                />
              </div>
            ))}
            {table.rowIds.map((rowId) => table.columnIds.map((columnId) => (
              <div key={`${rowId}-${columnId}`} className={`border-b border-r border-white/[0.06] ${focus?.rowId === rowId && focus.columnId === columnId ? 'ring-1 ring-inset ring-sky-400/60' : ''}`}>
                <Cell
                  value={table.cell(rowId, columnId)}
                  disabled={disabled}
                  cellRef={(element) => { if (element) cells.current.set(key(rowId, columnId), element); else cells.current.delete(key(rowId, columnId)) }}
                  onFocus={() => setFocus({ rowId, columnId })}
                  onChange={(value) => apply(setCell(rowId, columnId, value))}
                  onKeyDown={handleKeyDown(rowId, columnId)}
                />
              </div>
            )))}
          </div>
        </div>
      </div>
    </ResizableNodeFrame>
  )
}

export const TableNode = memo(TableNodeImpl)
TableNode.displayName = 'TableNode'
