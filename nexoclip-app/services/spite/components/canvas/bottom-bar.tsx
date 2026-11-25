'use client'

import { memo, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  Box,
  CheckCircle2,
  Clapperboard,
  Crosshair,
  Eraser,
  Folder,
  History,
  ImagePlus,
  Layers,
  MapPin,
  Maximize2,
  MessageCircle,
  Minus,
  Plus,
  Redo2,
  Scissors,
  Search,
  Sparkles,
  Table2,
  Undo2,
  Upload,
  User,
} from 'lucide-react'
import { useReactFlow, useViewport } from '@xyflow/react'

export type CanvasTool = 'select' | 'hand' | 'cut' | 'comment' | 'note' | 'text' | 'table' | 'pen' | 'eraser'
type AssetAction = 'history' | 'upload' | 'characters' | 'props' | 'locations' | 'general'
type IconComponent = ComponentType<{ className?: string; size?: number; strokeWidth?: number }>

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
  showResolvedComments?: boolean
  onToggleResolvedComments?: () => void
}

const SPRING = 'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]'

const DOCK_SURFACE =
  'pointer-events-auto rounded-[18px] border border-zinc-800/90 bg-[#1c1c1e]/95 shadow-[0_10px_34px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]'

const PILL_SURFACE =
  'pointer-events-auto rounded-[14px] border border-zinc-800/90 bg-[#1c1c1e]/95 shadow-[0_6px_22px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]'

const POPOVER_SURFACE =
  'dock-popover-enter pointer-events-auto rounded-[16px] border border-zinc-800 bg-[#1c1c1e]/98 shadow-[0_14px_38px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]'

const EXTRA_TOOLS: {
  id: CanvasTool
  icon: IconComponent
  label: string
  shortcut?: string
  description: string
}[] = [
  { id: 'comment', icon: MessageCircle, label: 'Comment', shortcut: 'C', description: 'Drop feedback pin' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E', description: 'Erase drawn strokes' },
  { id: 'table', icon: Table2, label: 'Table', description: 'Shot list or brief' },
  { id: 'cut', icon: Scissors, label: 'Cut Wire', description: 'Disconnect two nodes' },
]

const LIBRARY_ITEMS: {
  id: AssetAction
  icon: IconComponent
  label: string
  description: string
}[] = [
  { id: 'upload', icon: Upload, label: 'Upload Media', description: 'Add image or video' },
  { id: 'history', icon: History, label: 'Generation History', description: 'All generated media' },
  { id: 'characters', icon: User, label: 'Characters', description: 'Cast & consistent faces' },
  { id: 'props', icon: Box, label: 'Props', description: 'Products & objects' },
  { id: 'locations', icon: MapPin, label: 'Locations', description: 'Scenes & environments' },
  { id: 'general', icon: Folder, label: 'General Folders', description: 'Saved references' },
]

/* ---------- Illustrated & Tactile Dock Artworks ---------- */

function CursorArtwork() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className={`${SPRING} group-hover:-translate-x-[1.5px] group-hover:-translate-y-[1.5px] group-hover:scale-105 group-active:scale-95`}
      aria-hidden="true"
    >
      <path
        d="M5.5 4.5L18.5 10.6L12.6 12.6L10.3 18.8L5.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HandArtwork() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      className={`${SPRING} origin-bottom group-hover:-translate-y-[1.5px] group-hover:-rotate-[9deg] group-hover:scale-105 group-active:scale-95`}
      aria-hidden="true"
    >
      <path
        d="M18 11.5V6.8C18 6 17.3 5.3 16.5 5.3C15.7 5.3 15 6 15 6.8V10.5M15 9.8V4.8C15 4 14.3 3.3 13.5 3.3C12.7 3.3 12 4 12 4.8V10.5M12 10.2V5.5C12 4.7 11.3 4 10.5 4C9.7 4 9 4.7 9 5.5V12.8L7.4 11.4C6.7 10.8 5.6 10.9 5 11.6C4.5 12.2 4.6 13.2 5.2 13.8L9.1 17.8C10.3 19 11.9 19.7 13.6 19.7H14.2C16.8 19.7 18.8 17.6 18.8 15V11.5C18.8 10.7 18.4 10.2 18 10.2Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PencilArtwork({ active }: { active: boolean }) {
  return (
    <span className="pointer-events-none relative flex h-[48px] w-10 items-end justify-center overflow-hidden rounded-b-[12px]">
      <svg
        width="26"
        height="46"
        viewBox="0 0 26 46"
        fill="none"
        className={`${SPRING} origin-bottom ${
          active
            ? '-translate-y-[1px] scale-[1.06]'
            : 'translate-y-[6px] group-hover:translate-y-[0px] group-hover:-rotate-[3deg]'
        }`}
        aria-hidden="true"
      >
        {/* Wood cone */}
        <path d="M13 3L20.5 17.5H5.5L13 3Z" fill="#E8C3A4" />
        <path d="M13 3L20.5 17.5H15.2L13 3Z" fill="#D5A683" />
        <path d="M13 3L10.6 17.5H5.5L13 3Z" fill="#F3D6BD" />
        {/* Bright sharpened graphite tip */}
        <path d="M13 2.5L15.6 7.6C14.7 8.1 13.9 8.3 13 8.3C12.1 8.3 11.3 8.1 10.4 7.6L13 2.5Z" fill="#FAFAFA" />
        <path d="M13 2.5L14.1 4.8L13 5.2L11.9 4.8L13 2.5Z" fill="#27272A" />
        {/* Scalloped collar between wood and painted barrel */}
        <path
          d="M5.5 17.5C6.8 16.3 8.5 16.3 9.7 17.5C11.3 16.2 14.7 16.2 16.3 17.5C17.5 16.3 19.2 16.3 20.5 17.5V46H5.5V17.5Z"
          fill="#E4E4E7"
        />
        {/* Left highlight facet */}
        <path d="M5.5 17.5C6.8 16.3 8.5 16.3 9.7 17.5V46H5.5V17.5Z" fill="#F4F4F5" />
        {/* Center bright facet */}
        <path d="M9.7 17.5C11.3 16.2 14.7 16.2 16.3 17.5V46H9.7V17.5Z" fill="#FFFFFF" />
        {/* Right shaded facet */}
        <path d="M16.3 17.5C17.5 16.3 19.2 16.3 20.5 17.5V46H16.3V17.5Z" fill="#BDBDC4" />
        {/* Subtle vertical flute lines */}
        <line x1="9.7" y1="17.5" x2="9.7" y2="46" stroke="#D4D4D8" strokeWidth="0.7" />
        <line x1="16.3" y1="17.5" x2="16.3" y2="46" stroke="#A1A1AA" strokeWidth="0.7" />
      </svg>
    </span>
  )
}

function StickyNoteArtwork({ active }: { active: boolean }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      className={`${SPRING} overflow-visible ${
        active
          ? '-translate-y-1 -rotate-[4deg] scale-110'
          : 'group-hover:-translate-y-1.5 group-hover:-rotate-[5deg] group-hover:scale-110 group-active:scale-95'
      }`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nxStickyGrad" x1="5" y1="4" x2="26" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB84D" />
          <stop offset="55%" stopColor="#FA9628" />
          <stop offset="100%" stopColor="#EA7612" />
        </linearGradient>
      </defs>
      {/* Back stacked sheet — fans subtly on hover */}
      <rect
        x="6.5"
        y="6"
        width="20"
        height="20"
        rx="2.6"
        fill="#A8520D"
        className={`${SPRING} origin-center translate-x-[1px] translate-y-[1.5px] rotate-[4deg] group-hover:translate-x-[2px] group-hover:rotate-[9deg]`}
      />
      {/* Mid sheet */}
      <rect
        x="6"
        y="5.5"
        width="20"
        height="20"
        rx="2.6"
        fill="#C86814"
        className={`${SPRING} origin-center rotate-[2deg] group-hover:rotate-[4deg]`}
      />
      {/* Front orange sticky note with curled corner */}
      <path
        d="M5.5 7.5C5.5 6.1 6.6 5 8 5H24C25.4 5 26.5 6.1 26.5 7.5V19.6L20.6 25.5H8C6.6 25.5 5.5 24.4 5.5 23V7.5Z"
        fill="url(#nxStickyGrad)"
      />
      {/* Curled corner underside shadow */}
      <path d="M20.6 25.5L26.5 19.6H22.2C21.3 19.6 20.6 20.3 20.6 21.2V25.5Z" fill="#FFE0A6" />
      <path d="M20.6 25.5L22.5 21.8L26.5 19.6L20.6 25.5Z" fill="#D96B0F" fillOpacity="0.35" />
    </svg>
  )
}

function ShapesArtwork({ active }: { active: boolean }) {
  return (
    <svg
      width="32"
      height="28"
      viewBox="0 0 34 30"
      fill="none"
      className={`${SPRING} overflow-visible ${active ? 'scale-105' : 'group-active:scale-95'}`}
      aria-hidden="true"
    >
      {/* Back-left tilted dark grey card */}
      <rect
        x="3.5"
        y="8.5"
        width="14.5"
        height="14.5"
        rx="3.2"
        fill="#6B6B73"
        className={`${SPRING} origin-center -rotate-[10deg] group-hover:-translate-x-[2.5px] group-hover:-translate-y-[0.5px] group-hover:-rotate-[18deg]`}
      />
      {/* Back-right soft grey circle */}
      <circle
        cx="24.5"
        cy="17.5"
        r="6.2"
        fill="#A1A1AA"
        className={`${SPRING} origin-center group-hover:translate-x-[2.5px] group-hover:translate-y-[0.5px] group-hover:scale-105`}
      />
      {/* Front crisp white rounded square */}
      <rect
        x="10.2"
        y="5"
        width="14.8"
        height="14.8"
        rx="3.4"
        fill="#FAFAFA"
        className={`${SPRING} origin-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)] group-hover:-translate-y-[2px] group-hover:scale-105`}
      />
    </svg>
  )
}

function SerifTArtwork() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className={`${SPRING} group-hover:-translate-y-[1.5px] group-hover:scale-110 group-active:scale-95`}
      aria-hidden="true"
    >
      <path
        d="M5 7.5V5H19V7.5M12 5V19M9 19H15"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ---------- Reusable Dock Slot with Instant Tooltip ---------- */

function DockSlot({
  label,
  shortcut,
  active = false,
  submenuOpen = false,
  flushBottom = false,
  indicatorDot = false,
  onClick,
  dataTour,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  submenuOpen?: boolean
  flushBottom?: boolean
  indicatorDot?: boolean
  onClick?: () => void
  dataTour?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      onClick={onClick}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active || undefined}
      aria-expanded={submenuOpen ? true : undefined}
      className={`group relative flex shrink-0 items-center justify-center rounded-[12px] transition-colors ${
        flushBottom ? '-my-1.5 h-[50px] w-10 items-end' : 'h-[38px] w-[38px]'
      } ${
        active && !flushBottom
          ? 'bg-[#2e2e32] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : submenuOpen
            ? 'bg-[#2a2a2e] text-white'
            : flushBottom
              ? 'text-zinc-200 hover:bg-zinc-800/60'
              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
      }`}
    >
      {children}
      {indicatorDot && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-400" />
      )}
      {!submenuOpen && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-800 bg-[#141416] px-2.5 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] leading-none text-zinc-300">
              {shortcut}
            </kbd>
          )}
        </span>
      )}
    </button>
  )
}

/* ---------- Isolated Zoom Readout (only leaf subscribed to viewport) ---------- */

function ZoomReadout() {
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const atMinZoom = zoom <= 0.305
  return (
    <div className={`${PILL_SURFACE} flex items-center gap-0.5 px-1.5 py-1`}>
      <button
        type="button"
        onClick={() => zoomOut({ duration: 150 })}
        disabled={atMinZoom}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
        title={atMinZoom ? 'Minimum zoom (30%)' : 'Zoom out'}
        aria-label="Zoom out"
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <span className="min-w-[40px] select-none text-center text-[11px] font-medium tabular-nums text-zinc-300">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => zoomIn({ duration: 150 })}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus size={14} strokeWidth={1.8} />
      </button>
      <div className="mx-1 h-4 w-px bg-zinc-800" />
      <button
        type="button"
        onClick={() => fitView({ duration: 250, padding: 0.2 })}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        title="Fit canvas"
        aria-label="Fit canvas"
      >
        <Maximize2 size={13} strokeWidth={1.8} />
      </button>
    </div>
  )
}

/* ---------- Main BottomBar ---------- */

export const BottomBar = memo(function BottomBar({
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
  showResolvedComments = false,
  onToggleResolvedComments,
}: BottomBarProps) {
  const [openMenu, setOpenMenu] = useState<'extras' | 'library' | 'addNode' | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  const activeExtraTool = EXTRA_TOOLS.find((tool) => tool.id === activeTool)

  return (
    <>
      {/* Contextual resolved-comments chip when Comment mode is active */}
      {activeTool === 'comment' && (
        <div className="pointer-events-none absolute bottom-[78px] left-1/2 z-30 -translate-x-1/2">
          <button
            type="button"
            onClick={onToggleResolvedComments}
            aria-pressed={showResolvedComments}
            className={`${PILL_SURFACE} flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
              showResolvedComments ? 'text-violet-300' : 'text-zinc-300 hover:bg-zinc-800/90'
            }`}
          >
            <CheckCircle2 size={14} strokeWidth={1.8} />
            <span>{showResolvedComments ? 'Showing resolved comments' : 'Show resolved comments'}</span>
          </button>
        </div>
      )}

      {/* Centered Illustrated Dock + Detached Undo/Redo Pill */}
      <div
        ref={dockRef}
        className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5"
      >
        {/* Detached Undo / Redo pill */}
        <div data-tour="undo-redo" className={`${PILL_SURFACE} flex items-center gap-0.5 p-1`}>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo (Ctrl+Z)"
            className="group relative flex h-8 w-8 items-center justify-center rounded-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2
              size={15}
              strokeWidth={1.8}
              className={`${SPRING} group-hover:-rotate-[14deg] group-active:scale-90`}
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-800 bg-[#141416] px-2.5 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
            >
              <span>Undo</span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] leading-none text-zinc-300">
                Ctrl+Z
              </kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo (Ctrl+Shift+Z)"
            className="group relative flex h-8 w-8 items-center justify-center rounded-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Redo2
              size={15}
              strokeWidth={1.8}
              className={`${SPRING} group-hover:rotate-[14deg] group-active:scale-90`}
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-800 bg-[#141416] px-2.5 py-1 text-[11px] font-medium text-zinc-100 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
            >
              <span>Redo</span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] leading-none text-zinc-300">
                Ctrl+Shift+Z
              </kbd>
            </span>
          </button>
        </div>

        {/* Main Tactile Illustrated Dock */}
        <nav
          data-tour="canvas-toolbar"
          aria-label="Canvas tools"
          className={`${DOCK_SURFACE} relative flex h-[50px] items-center gap-1 px-1.5`}
        >
          {/* 1. Navigate: Select & Hand */}
          <span data-tour="tools-navigate" className="flex items-center gap-0.5">
            <DockSlot
              label="Select"
              shortcut="V"
              active={activeTool === 'select'}
              onClick={() => {
                setOpenMenu(null)
                onSetTool?.('select')
              }}
            >
              <CursorArtwork />
            </DockSlot>
            <DockSlot
              label="Hand"
              shortcut="H"
              active={activeTool === 'hand'}
              onClick={() => {
                setOpenMenu(null)
                onSetTool?.('hand')
              }}
            >
              <HandArtwork />
            </DockSlot>
          </span>

          <div className="mx-1 h-5 w-px bg-zinc-700/70" />

          {/* 2. Tactile Creation Tools: Pencil, Sticky Note, Board Shapes/Extras, Text */}
          <span data-tour="tools-draw" className="flex items-center">
            <DockSlot
              label="Draw"
              shortcut="P"
              active={activeTool === 'pen'}
              flushBottom
              onClick={() => {
                setOpenMenu(null)
                onSetTool?.(activeTool === 'pen' ? 'select' : 'pen')
              }}
            >
              <PencilArtwork active={activeTool === 'pen'} />
            </DockSlot>
          </span>

          <span data-tour="tools-board" className="flex items-center gap-1">
            <DockSlot
              label="Sticky Note"
              shortcut="N"
              active={activeTool === 'note'}
              onClick={() => {
                setOpenMenu(null)
                onSetTool?.('note')
              }}
            >
              <StickyNoteArtwork active={activeTool === 'note'} />
            </DockSlot>

            {/* Layered Shapes -> Board & Extras Popover (Comment, Eraser, Table, Cut Wire) */}
            <span data-tour="tools-comment" className="relative flex items-center">
              <DockSlot
                label={activeExtraTool ? activeExtraTool.label : 'Board & More'}
                shortcut={activeExtraTool?.shortcut}
                active={Boolean(activeExtraTool)}
                submenuOpen={openMenu === 'extras'}
                indicatorDot={Boolean(activeExtraTool)}
                onClick={() => setOpenMenu((curr) => (curr === 'extras' ? null : 'extras'))}
              >
                <ShapesArtwork active={Boolean(activeExtraTool) || openMenu === 'extras'} />
              </DockSlot>

              {openMenu === 'extras' && (
                <div
                  role="menu"
                  aria-label="Board and extra tools"
                  className={`${POPOVER_SURFACE} absolute bottom-full left-1/2 z-50 mb-3 w-[228px] -translate-x-1/2 p-1.5`}
                >
                  <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Board &amp; Tools
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {EXTRA_TOOLS.map(({ id, icon: Icon, label, shortcut, description }) => {
                      const isActive = activeTool === id
                      return (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onSetTool?.(id)
                            setOpenMenu(null)
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                            isActive
                              ? 'bg-[#2e2e34] text-white'
                              : 'text-zinc-200 hover:bg-zinc-800'
                          }`}
                        >
                          <Icon size={15} strokeWidth={1.8} className="shrink-0 text-zinc-300" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium leading-tight">{label}</div>
                            <div className="text-[10px] leading-tight text-zinc-400">{description}</div>
                          </div>
                          {shortcut && (
                            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-300">
                              {shortcut}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </span>

            <DockSlot
              label="Text"
              shortcut="T"
              active={activeTool === 'text'}
              onClick={() => {
                setOpenMenu(null)
                onSetTool?.('text')
              }}
            >
              <SerifTArtwork />
            </DockSlot>
          </span>

          <div className="mx-1 h-5 w-px bg-zinc-700/70" />

          {/* 3. Assets & Library Search Popover */}
          <span data-tour="asset-tools" className="relative flex items-center">
            <DockSlot
              label="Library & Assets"
              submenuOpen={openMenu === 'library'}
              onClick={() => setOpenMenu((curr) => (curr === 'library' ? null : 'library'))}
            >
              <Search
                size={18}
                strokeWidth={1.75}
                className={`${SPRING} group-hover:-rotate-12 group-hover:scale-110 group-active:scale-95`}
              />
            </DockSlot>

            {openMenu === 'library' && (
              <div
                role="menu"
                aria-label="Library and assets"
                className={`${POPOVER_SURFACE} absolute bottom-full right-0 z-50 mb-3 w-[232px] p-1.5`}
              >
                <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Library &amp; Assets
                </div>
                <div className="grid grid-cols-1 gap-0.5">
                  {LIBRARY_ITEMS.map(({ id, icon: Icon, label, description }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onAssetAction?.(id)
                        setOpenMenu(null)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-zinc-200 transition-colors hover:bg-zinc-800"
                    >
                      <Icon size={15} strokeWidth={1.8} className="shrink-0 text-zinc-400" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium leading-tight">{label}</div>
                        <div className="text-[10px] leading-tight text-zinc-400">{description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </span>

          {/* 4. Hero White Pill: + Add node */}
          <span data-tour="add-nodes" className="relative ml-1 flex items-center">
            <button
              type="button"
              data-tour="add-video"
              onClick={() => setOpenMenu((curr) => (curr === 'addNode' ? null : 'addNode'))}
              aria-expanded={openMenu === 'addNode'}
              aria-haspopup="menu"
              className="group flex h-[38px] items-center gap-1.5 rounded-[13px] bg-[#f4f4f6] px-3.5 text-[13px] font-medium text-[#141416] shadow-sm transition-all duration-200 hover:bg-white active:scale-[0.97]"
            >
              <Plus
                size={15}
                strokeWidth={2.2}
                className={`${SPRING} ${openMenu === 'addNode' ? 'rotate-45' : 'group-hover:rotate-90'}`}
              />
              <span className="whitespace-nowrap">Add node</span>
            </button>

            {openMenu === 'addNode' && (
              <div
                role="menu"
                aria-label="Add node"
                className={`${POPOVER_SURFACE} absolute bottom-full right-0 z-50 mb-3 w-[238px] p-1.5`}
              >
                <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Add Node
                </div>
                <div className="grid grid-cols-1 gap-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddNode?.('prompt')
                      setOpenMenu(null)
                    }}
                    className="group/item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                      <Sparkles size={15} strokeWidth={1.8} className={`${SPRING} group-hover/item:scale-110`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium leading-tight">Prompt</div>
                      <div className="text-[10px] leading-tight text-zinc-400">Write &amp; wire AI prompts</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddNode?.('imageGen')
                      setOpenMenu(null)
                    }}
                    className="group/item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
                      <ImagePlus size={15} strokeWidth={1.8} className={`${SPRING} group-hover/item:scale-110`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium leading-tight">Image Generator</div>
                      <div className="text-[10px] leading-tight text-zinc-400">Generate visuals &amp; keyframes</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddNode?.('videoGen')
                      setOpenMenu(null)
                    }}
                    className="group/item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                      <Clapperboard size={15} strokeWidth={1.8} className={`${SPRING} group-hover/item:scale-110`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium leading-tight">Video Generator</div>
                      <div className="text-[10px] leading-tight text-zinc-400">Animate &amp; extend shots</div>
                    </div>
                  </button>

                  <div className="my-1 h-px bg-zinc-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAssetAction?.('upload')
                      setOpenMenu(null)
                    }}
                    className="group/item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-zinc-200 transition-colors hover:bg-zinc-800"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                      <Upload size={14} strokeWidth={1.8} className={`${SPRING} group-hover/item:-translate-y-0.5`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium leading-tight">Upload Media</div>
                      <div className="text-[10px] leading-tight text-zinc-400">Drop image or video reference</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </span>
        </nav>
      </div>

      {/* Bottom corners: Canvas Page / Recenter (left) and Zoom Controls (right) */}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex items-end justify-between">
        <div data-tour="canvas-page" className={`${PILL_SURFACE} flex items-center gap-1 px-2.5 py-1`}>
          <Layers size={13} strokeWidth={1.8} className="text-zinc-400" />
          <span className="select-none text-[11px] font-medium text-zinc-300">Canvas {page}</span>
          <div className="mx-1 h-4 w-px bg-zinc-800" />
          <button
            type="button"
            onClick={onRecenter}
            className="group flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            title="Recenter canvas"
            aria-label="Recenter canvas"
          >
            <Crosshair size={14} strokeWidth={1.8} className={`${SPRING} group-hover:rotate-45`} />
          </button>
        </div>

        <div data-tour="zoom-controls" className="pointer-events-auto">
          <ZoomReadout />
        </div>
      </div>
    </>
  )
})
