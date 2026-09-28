'use client'

import Link from 'next/link'
import { ArrowLeft, MagnifyingGlassPlus, MagnifyingGlassMinus, CornersOut, CheckCircle, Circle, WarningCircle, Prohibit, ListChecks, Question, Sparkle, ShareNetwork, ChatCircleDots } from '@phosphor-icons/react'
import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import { getCanvasSaveIndicator } from '@/lib/canvas-runtime-ui'
import { startTour } from '@/lib/onboarding'
import type { ProjectRuntimeState } from '@/realtime/project-runtime'
import type { RemotePresencePeer } from '@/lib/realtime/presence'
import { CanvasGuestList } from './canvas-guest-list'
import { VersionBadge } from '@/components/version-badge'

interface CanvasToolbarProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  persistenceStatus: ProjectRuntimeState
  projectId: string
  readOnly?: boolean
  // Right-side jobs panel: workspace owns the open/close state so the
  // panel persists across canvas interactions and the toolbar just
  // triggers the toggle.
  jobsPanelOpen?: boolean
  onToggleJobsPanel?: () => void
  activeJobCount?: number
  guests?: RemotePresencePeer[]
  onFollowGuest?: (peer: RemotePresencePeer) => void
}

export function CanvasToolbar({ projectName, onProjectNameChange, persistenceStatus, projectId, readOnly = false, jobsPanelOpen, onToggleJobsPanel, activeJobCount = 0, guests = [], onFollowGuest }: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [editing, setEditing] = useState(false)
  const saveIndicator = getCanvasSaveIndicator(persistenceStatus)

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0b0c11]/85 px-4 backdrop-blur-md relative z-30">
      {/* Left */}
      <div className="flex items-center gap-3">
        <a
          href={process.env.NEXT_PUBLIC_STUDIO_URL || '/studio'}
          className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
        >
          <ArrowLeft size={14} weight="thin" />
          Kembali ke Studio
        </a>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-400 via-lime-400 to-emerald-400 text-slate-950 shadow-lg shadow-lime-500/10"><Sparkle size={16} weight="fill" /></div>
        <Link href="/" className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-100">Projects</Link>
        <div className="w-px h-4 bg-border" />
        {editing ? (
          <input
            autoFocus
            value={projectName}
            onChange={e => onProjectNameChange(e.target.value)}
            readOnly={readOnly}
            onBlur={() => setEditing(false)}
            onKeyDown={e => e.key === 'Enter' && setEditing(false)}
            className="bg-transparent border-none outline-none text-foreground text-base tracking-tight"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          />
        ) : (
          <button
            onClick={() => {
              if (readOnly) return
              setEditing(true)
            }}
            className="text-sm font-semibold tracking-tight text-slate-200 transition-colors hover:text-sky-300 cursor-text"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <button className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.1]" title="Ask agent"><ChatCircleDots size={14} /> <span className="hidden sm:inline">Mengobrol</span></button>
        <button className="flex h-7 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100" title="Share"><ShareNetwork size={14} /> <span className="hidden sm:inline">Bagikan</span></button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          onClick={() => zoomIn({ duration: 200 })}
          className="flex items-center justify-center w-7 h-7 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <MagnifyingGlassPlus size={14} weight="thin" />
        </button>
        <button
          onClick={() => zoomOut({ duration: 200 })}
          className="flex items-center justify-center w-7 h-7 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <MagnifyingGlassMinus size={14} weight="thin" />
        </button>
        <button
          onClick={() => fitView({ duration: 300, padding: 0.1 })}
          className="flex items-center justify-center w-7 h-7 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Fit to screen"
        >
          <CornersOut size={14} weight="thin" />
        </button>

        {onFollowGuest && <CanvasGuestList peers={guests} onFollow={onFollowGuest} />}

        <div className="w-px h-4 bg-border mx-1" />

        <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider select-none">
          {saveIndicator.persisted ? (
            <CheckCircle size={11} weight="fill" className="text-accent/60" />
          ) : saveIndicator.label === 'Degraded' ? (
            <WarningCircle size={11} weight="fill" className="text-amber-300/80" />
          ) : saveIndicator.label === 'Read-only' ? (
            <Prohibit size={11} weight="fill" className="text-destructive/80" />
          ) : (
            <Circle size={11} weight="thin" className="text-muted-foreground/40" />
          )}
          <span
            className={
              saveIndicator.persisted
                ? 'text-accent/60'
                : saveIndicator.label === 'Degraded'
                  ? 'text-amber-300/80'
                  : saveIndicator.label === 'Read-only'
                    ? 'text-destructive/80'
                    : 'text-muted-foreground/40'
            }
          >
            {saveIndicator.label}
          </span>
        </div>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Jobs panel toggle — only renders when the workspace wires
            it up (effectively always, but the prop is optional so the
            toolbar can render without it during early init). */}
        {onToggleJobsPanel && (
          <button
            data-tour="jobs-toggle"
            onClick={onToggleJobsPanel}
            className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
              jobsPanelOpen
                ? 'bg-accent/20 text-accent'
                : 'glass-hover text-muted-foreground hover:text-foreground'
            }`}
            title={jobsPanelOpen ? 'Close jobs panel' : 'Open jobs panel'}
          >
            <ListChecks size={13} weight="thin" />
            {activeJobCount > 0 && !jobsPanelOpen && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent animate-pulse"
                title={`${activeJobCount} active job${activeJobCount === 1 ? '' : 's'}`}
              />
            )}
          </button>
        )}

        <VersionBadge className="mr-1" />

        <button
          onClick={() => startTour('canvas')}
          className="flex items-center justify-center w-7 h-7 rounded-lg glass-hover transition-colors text-muted-foreground hover:text-foreground"
          title="Take the tour"
          aria-label="Take the tour"
        >
          <Question size={13} weight="thin" />
        </button>

      </div>
    </div>
  )
}
