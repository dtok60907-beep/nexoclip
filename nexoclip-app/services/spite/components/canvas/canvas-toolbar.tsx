'use client'

import Link from 'next/link'
import { Sparkle, ChatCircleDots } from '@phosphor-icons/react'
import { useState } from 'react'
import type { ProjectRuntimeState } from '@/realtime/project-runtime'
import type { RemotePresencePeer } from '@/lib/realtime/presence'
import { CanvasGuestList } from './canvas-guest-list'
import { CreditBalanceBadge } from './credit-balance-badge'

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
  chatOpen?: boolean
  chatUnread?: number
  onToggleChat?: () => void
}

export function CanvasToolbar({ projectName, onProjectNameChange, readOnly = false, guests = [], onFollowGuest, chatOpen = false, chatUnread = 0, onToggleChat }: CanvasToolbarProps) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0b0c11]/85 px-4 backdrop-blur-md relative z-30">
      {/* Left */}
      <div className="flex items-center gap-3">
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
        <CreditBalanceBadge />
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          className={`relative flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${chatOpen ? 'border-white/20 bg-white/[0.14] text-white' : 'border-white/[0.08] bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]'}`}
          title="Project chat"
        >
          <ChatCircleDots size={14} /> <span className="hidden sm:inline">Mengobrol</span>
          {chatUnread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white" aria-label={`${chatUnread} unread`}>
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          ) : null}
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        {onFollowGuest && <CanvasGuestList peers={guests} onFollow={onFollowGuest} />}

      </div>
    </div>
  )
}
