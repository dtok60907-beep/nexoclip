'use client'

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
  ClockCounterClockwise,
  CornersOut,
  Cursor,
  FilmSlate,
  Folder,
  Hand,
  ImageSquare,
  MapPin,
  Minus,
  Package,
  Plus,
  Scissors,
  Target,
  TextT,
  UploadSimple,
  User,
} from '@phosphor-icons/react'
import { useReactFlow, useViewport } from '@xyflow/react'

type CanvasTool = 'select' | 'hand' | 'cut'
type AssetAction = 'history' | 'upload' | 'characters' | 'props' | 'locations' | 'general'

interface BottomBarProps {
  page: number
  onRecenter: () => void
  activeTool?: CanvasTool
  onSetTool?: (tool: CanvasTool) => void
  onAddNode?: (type: string) => void
  onAssetAction?: (action: AssetAction) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

function ZoomReadout() {
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#12141c]/95 px-2 py-1.5 shadow-xl backdrop-blur-xl">
      <button onClick={() => zoomOut({ duration: 150 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Zoom out"><Minus size={13} /></button>
      <span className="min-w-[38px] text-center text-[11px] font-mono font-semibold text-slate-300">{Math.round(zoom * 100)}%</span>
      <button onClick={() => zoomIn({ duration: 150 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Zoom in"><Plus size={13} /></button>
      <div className="mx-1 h-3.5 w-px bg-white/10" />
      <button onClick={() => fitView({ duration: 250, padding: 0.2 })} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Fit canvas"><CornersOut size={13} /></button>
    </div>
  )
}

const buttonClass = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30'

export function BottomBar({
  page,
  onRecenter,
  activeTool = 'select',
  onSetTool,
  onAddNode,
  onAssetAction,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
}: BottomBarProps) {
  const tools: { id: CanvasTool; icon: typeof Cursor; label: string }[] = [
    { id: 'select', icon: Cursor, label: 'Cursor — interact with nodes' },
    { id: 'hand', icon: Hand, label: 'Hand — pan canvas only' },
    { id: 'cut', icon: Scissors, label: 'Cut connections' },
  ]

  return (
    <>
      <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 max-w-[calc(100%-250px)] -translate-x-1/2">
        <nav className="pointer-events-auto flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-white/[0.1] bg-[#12141c]/95 px-2.5 py-2 shadow-2xl backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Canvas tools">
          {tools.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => onSetTool?.(id)} className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${activeTool === id ? 'bg-lime-400 text-slate-950 shadow-sm shadow-lime-400/30' : 'text-slate-400 hover:bg-white/[0.07] hover:text-slate-100'}`} title={label} aria-label={label}>
              <Icon size={16} weight={activeTool === id ? 'fill' : 'regular'} />
            </button>
          ))}

          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <button onClick={() => onAddNode?.('prompt')} className={buttonClass} title="Add Prompt"><TextT size={16} /></button>
          <button onClick={() => onAddNode?.('imageGen')} className={`${buttonClass} text-cyan-400`} title="Add Image Generator"><ImageSquare size={16} /></button>
          <button onClick={() => onAddNode?.('videoGen')} className={`${buttonClass} text-indigo-400`} title="Add Video Generator"><FilmSlate size={16} /></button>

          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <button onClick={() => onAssetAction?.('history')} className={buttonClass} title="Generation history and assets"><ClockCounterClockwise size={16} /></button>
          <button onClick={() => onAssetAction?.('upload')} className={buttonClass} title="Upload image"><UploadSimple size={16} /></button>
          <button onClick={() => onAssetAction?.('characters')} className={buttonClass} title="Characters"><User size={16} /></button>
          <button onClick={() => onAssetAction?.('props')} className={buttonClass} title="Props"><Package size={16} /></button>
          <button onClick={() => onAssetAction?.('locations')} className={buttonClass} title="Locations"><MapPin size={16} /></button>
          <button onClick={() => onAssetAction?.('general')} className={buttonClass} title="General folders"><Folder size={16} /></button>

          <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <button onClick={onUndo} disabled={!canUndo} className={buttonClass} title="Undo"><ArrowCounterClockwise size={16} /></button>
          <button onClick={onRedo} disabled={!canRedo} className={buttonClass} title="Redo"><ArrowClockwise size={16} /></button>
        </nav>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex items-end justify-between">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#12141c]/95 px-2.5 py-1.5 shadow-xl backdrop-blur-xl">
          <ArrowsOut size={12} className="text-slate-400" />
          <span className="text-[11px] font-mono text-slate-400">Canvas {page}</span>
          <div className="mx-1 h-3.5 w-px bg-white/10" />
          <button onClick={onRecenter} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" title="Recenter canvas" aria-label="Recenter canvas"><Target size={13} /></button>
        </div>
        <div className="pointer-events-auto"><ZoomReadout /></div>
      </div>
    </>
  )
}
