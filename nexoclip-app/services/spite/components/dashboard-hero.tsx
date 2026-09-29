'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { withBasePath } from '@/lib/base-path'

type NodeId = 'prompt' | 'shoe' | 'jacket' | 'model' | 'motion' | 'server'

type NodePos = { x: number; y: number }

// Purely decorative — a small animated node graph that mirrors what the
// canvas below actually does (prompt → reference assets → model → output),
// so the empty-state hero doubles as a hint at the product rather than
// generic marketing art. Positions are percentages of the viewport so it
// reflows sanely at any width; dragging is local-only (not persisted) —
// it's a fidget, not a feature.
const INITIAL_POSITIONS: Record<NodeId, NodePos> = {
  prompt: { x: 9, y: 66 },
  shoe: { x: 15, y: 16 },
  jacket: { x: 30, y: 42 },
  model: { x: 50, y: 50 },
  motion: { x: 72, y: 24 },
  server: { x: 88, y: 56 },
}

const CABLES: Array<[NodeId, NodeId]> = [
  ['prompt', 'jacket'],
  ['shoe', 'jacket'],
  ['jacket', 'model'],
  ['model', 'motion'],
  ['motion', 'server'],
]

// Object-only generated stills (no people — see generate-hero-images.mjs
// for why), sized like the reference mockup's own node cards: one small
// square, one tall portrait, two wide landscapes.
function NodeImageCard({
  id,
  src,
  label,
  className,
  onPointerDown,
}: {
  id: NodeId
  src: string
  label: string
  className: string
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      data-node-id={id}
      onPointerDown={onPointerDown}
      className={`group absolute rounded-2xl p-1.5 bg-[#0d1117]/90 backdrop-blur-md border border-white/10 hover:border-accent/40 shadow-xl select-none touch-none cursor-grab active:cursor-grabbing transition-colors ${className}`}
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <img
        src={withBasePath(src)}
        alt=""
        draggable={false}
        className="w-full h-full object-cover rounded-lg pointer-events-none"
      />
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-mono tracking-wide bg-[#0d1117] border border-white/10 text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}

// The prompt node — a short read-only preview card, mirroring how the real
// canvas's prompt node looks, instead of an icon+label chip like the rest.
function NodeTextCard({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      data-node-id="prompt"
      onPointerDown={onPointerDown}
      className="group absolute w-52 rounded-xl border border-white/10 bg-[#0d1117]/90 backdrop-blur-md p-3 shadow-xl select-none touch-none cursor-grab active:cursor-grabbing hover:border-accent/40 transition-colors"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-white/5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-[9px] font-mono tracking-wide text-muted-foreground">PROMPT</span>
      </div>
      <p className="text-[11px] leading-relaxed text-foreground/60 line-clamp-4">
        Cinematic wide shot of a city skyline at dusk, volumetric fog, cool blue
        rim light, shallow depth of field...
      </p>
    </div>
  )
}


export function DashboardHero() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<Record<NodeId, NodePos>>(INITIAL_POSITIONS)
  const dragRef = useRef<{ id: NodeId; offsetX: number; offsetY: number } | null>(null)

  const clampToViewport = useCallback((x: number, y: number) => {
    return { x: Math.min(96, Math.max(4, x)), y: Math.min(88, Math.max(8, y)) }
  }, [])

  const handlePointerDown = useCallback((id: NodeId) => (e: React.PointerEvent) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const pos = positions[id]
    const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
    const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100
    dragRef.current = { id, offsetX: pointerXPct - pos.x, offsetY: pointerYPct - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [positions])

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const viewport = viewportRef.current
      if (!drag || !viewport) return
      const rect = viewport.getBoundingClientRect()
      const pointerXPct = ((e.clientX - rect.left) / rect.width) * 100
      const pointerYPct = ((e.clientY - rect.top) / rect.height) * 100
      const next = clampToViewport(pointerXPct - drag.offsetX, pointerYPct - drag.offsetY)
      setPositions((prev) => ({ ...prev, [drag.id]: next }))
    }
    const handleUp = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [clampToViewport])

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-[460px] sm:h-[620px] overflow-hidden border-b border-white/5"
      aria-hidden="true"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-accent/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Cables */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {CABLES.map(([from, to]) => {
          const a = positions[from]
          const b = positions[to]
          return (
            <line
              key={`${from}-${to}`}
              x1={`${a.x}%`}
              y1={`${a.y}%`}
              x2={`${b.x}%`}
              y2={`${b.y}%`}
              stroke="#6B8FA8"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )
        })}
      </svg>

      {/* Center headline */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center px-6 pointer-events-none"
      >
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mb-2.5 rounded text-[9px] font-mono tracking-widest uppercase bg-white/5 border border-white/10 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Canvas
        </div>
        <h1
          className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground uppercase leading-[1.15]"
          style={{ fontFamily: 'var(--font-montserrat)' }}
        >
          Hasilkan Media yang<br />Menakjubkan dengan AI Canvas
        </h1>
      </div>

      {/* Nodes */}
      <div className="absolute inset-0 z-20">
        <div style={{ position: 'absolute', left: `${positions.prompt.x}%`, top: `${positions.prompt.y}%` }}>
          <NodeTextCard onPointerDown={handlePointerDown('prompt')} />
        </div>
        <div style={{ position: 'absolute', left: `${positions.shoe.x}%`, top: `${positions.shoe.y}%` }}>
          <NodeImageCard
            id="shoe"
            src="/dashboard-hero/hero-reference.jpg"
            label="Aset"
            className="w-28 h-28"
            onPointerDown={handlePointerDown('shoe')}
          />
        </div>
        <div style={{ position: 'absolute', left: `${positions.jacket.x}%`, top: `${positions.jacket.y}%` }}>
          <NodeImageCard
            id="jacket"
            src="/dashboard-hero/hero-tall.jpg"
            label="Referensi"
            className="w-36 h-48"
            onPointerDown={handlePointerDown('jacket')}
          />
        </div>
        <div style={{ position: 'absolute', left: `${positions.model.x}%`, top: `${positions.model.y}%` }}>
          <NodeImageCard
            id="model"
            src="/dashboard-hero/hero-model.jpg"
            label="Model AI"
            className="w-32 h-32"
            onPointerDown={handlePointerDown('model')}
          />
        </div>
        <div style={{ position: 'absolute', left: `${positions.motion.x}%`, top: `${positions.motion.y}%` }}>
          <NodeImageCard
            id="motion"
            src="/dashboard-hero/hero-wide-1.jpg"
            label="Hasil"
            className="w-52 h-32"
            onPointerDown={handlePointerDown('motion')}
          />
        </div>
        <div style={{ position: 'absolute', left: `${positions.server.x}%`, top: `${positions.server.y}%` }}>
          <NodeImageCard
            id="server"
            src="/dashboard-hero/hero-wide-2.jpg"
            label="Render"
            className="w-44 h-32"
            onPointerDown={handlePointerDown('server')}
          />
        </div>
      </div>
    </div>
  )
}
