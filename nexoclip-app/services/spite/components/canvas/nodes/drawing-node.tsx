'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { useCanvasCollaboration } from '../canvas-collaboration'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'

// The canvas sets this on its root while the eraser is active.
export const ERASER_ATTRIBUTE = 'data-canvas-eraser'

// One freehand stroke. Selectable, movable, lockable, groupable like any
// node. With the eraser, pressing on or sweeping across the stroke deletes it.
function DrawingNodeImpl({ id, data, selected }: NodeProps) {
  const record = data as Record<string, unknown>
  const { deleteNodes, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const width = typeof record.width === 'number' ? record.width : 10
  const height = typeof record.height === 'number' ? record.height : 10
  const path = typeof record.path === 'string' ? record.path : ''
  const color = typeof record.color === 'string' ? record.color : '#f8fafc'
  const strokeWidth = typeof record.strokeWidth === 'number' ? record.strokeWidth : 4

  const erase = (buttons: number) => {
    if (!allowDocumentMutation || record.locked === true || !(buttons & 1)) return
    if (document.querySelector(`[${ERASER_ATTRIBUTE}]`)) deleteNodes([id])
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      style={{ pointerEvents: 'none' }}
      aria-label="Drawing"
    >
      {selected ? <rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke="rgba(255,255,255,0.4)" strokeDasharray="4 3" /> : null}
      {/* A wide invisible stroke makes thin lines easy to click and erase. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(14, strokeWidth + 10)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onPointerDown={(event) => erase(event.buttons)}
        onPointerEnter={(event) => erase(event.buttons)}
      />
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const DrawingNode = memo(DrawingNodeImpl)
DrawingNode.displayName = 'DrawingNode'
