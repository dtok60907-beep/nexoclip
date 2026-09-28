'use client'

import { getBezierPath, type EdgeProps } from '@xyflow/react'

/**
 * Minimal luminous Bezier connector for the Nexoclip canvas.
 * It preserves Spite's existing edge contract and deletion behaviour while
 * deliberately avoiding animation-heavy SVG work on every canvas edge.
 */
export function ScissorsEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  selected,
  style,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const color = (style?.stroke as string) || '#38bdf8'
  const active = Boolean(selected)

  return (
    <g className={active ? 'spite-glow-edge spite-glow-edge-active' : 'spite-glow-edge'}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={active ? 7 : 5}
        strokeLinecap="round"
        opacity={active ? 0.26 : 0.14}
        style={{ filter: `blur(${active ? 4 : 3}px)` }}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={active ? 2.4 : 1.7}
        strokeLinecap="round"
        opacity={active ? 1 : 0.82}
      />
    </g>
  )
}
