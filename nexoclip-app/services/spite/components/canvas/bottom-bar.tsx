'use client'

import { Copy, Crosshair, Minus, Plus, CornersOut } from '@phosphor-icons/react'
import { useReactFlow, useViewport } from '@xyflow/react'

interface BottomBarProps {
  page: number
  onRecenter: () => void
}

// Self-contained zoom readout. It subscribes to the viewport itself so that
// panning/zooming re-renders ONLY this tiny label, not the whole canvas
// workspace (which is what `useViewport()` at the top level used to do — every
// pan frame re-rendered all nodes and edges).
function ZoomReadout() {
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#12141c]/90 px-2.5 py-1.5 shadow-xl backdrop-blur-xl">
      <button onClick={() => zoomOut({ duration: 150 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Zoom out"><Minus size={13} /></button>
      <span className="min-w-[38px] text-center text-[11px] font-mono font-semibold text-slate-300">{Math.round(zoom * 100)}%</span>
      <button onClick={() => zoomIn({ duration: 150 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Zoom in"><Plus size={13} /></button>
      <div className="mx-1 h-3.5 w-px bg-white/10" />
      <button onClick={() => fitView({ duration: 250, padding: 0.2 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Fit canvas"><CornersOut size={13} /></button>
    </div>
  )
}

export function BottomBar({ page, onRecenter }: BottomBarProps) {
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex items-end justify-between">
      {/* Left - Page indicator */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#12141c]/90 px-2.5 py-1.5 shadow-xl backdrop-blur-xl">
        <Copy size={12} weight="thin" className="text-muted-foreground" />
        <span className="text-[11px] font-mono text-muted-foreground tracking-wide">
          Page {page}
        </span>
      </div>

      {/* Center - Recenter */}
      <button
        onClick={onRecenter}
        className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#12141c]/90 px-3 py-1.5 text-slate-400 shadow-xl backdrop-blur-xl transition-colors hover:bg-white/[0.08] hover:text-slate-200"
      >
        <Crosshair size={12} weight="thin" />
        <span className="text-[11px] font-mono tracking-wide">Recenter</span>
      </button>

      {/* Right - Zoom (subscribes to the viewport on its own) */}
      <div className="pointer-events-auto"><ZoomReadout /></div>
    </div>
  )
}
