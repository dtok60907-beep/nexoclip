'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'

import { buildDrawingNode, strokeToPath, type Point } from '@/lib/drawing-path'

// While the pen is active this layer sits over the canvas and turns each
// press-drag-release into a stroke. Points are captured in flow coordinates
// so the stroke stays put when the canvas is panned or zoomed later.
export function PenOverlay({ color, strokeWidth, onStroke }: {
  color: string
  strokeWidth: number
  onStroke: (stroke: NonNullable<ReturnType<typeof buildDrawingNode>> & { color: string; strokeWidth: number }) => void
}) {
  const { screenToFlowPosition } = useReactFlow()
  const viewport = useViewport()
  const pointsRef = useRef<Point[] | null>(null)
  const lastScreenRef = useRef<Point | null>(null)
  const [livePath, setLivePath] = useState('')

  const toScreen = (point: Point) => ({ x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y })
  const redraw = () => setLivePath(strokeToPath((pointsRef.current ?? []).map(toScreen)))

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointsRef.current = [screenToFlowPosition({ x: event.clientX, y: event.clientY })]
    lastScreenRef.current = { x: event.clientX, y: event.clientY }
    redraw()
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointsRef.current) return
    const last = lastScreenRef.current
    // Skip sub-pixel jitter; the stroke is simplified on release anyway.
    if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 2) return
    lastScreenRef.current = { x: event.clientX, y: event.clientY }
    pointsRef.current.push(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    redraw()
  }

  const finish = () => {
    const points = pointsRef.current
    pointsRef.current = null
    lastScreenRef.current = null
    setLivePath('')
    if (!points) return
    // Simplify relative to the zoom so a stroke keeps ~1.5 screen px of detail.
    const stroke = buildDrawingNode(points, strokeWidth, 1.5 / (viewport.zoom || 1))
    if (stroke) onStroke({ ...stroke, color, strokeWidth })
  }

  return (
    <div
      className="absolute inset-0 z-[25] touch-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-label="Drawing layer"
    >
      {livePath ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path d={livePath} fill="none" stroke={color} strokeWidth={strokeWidth * viewport.zoom} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  )
}
