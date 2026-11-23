'use client'

import Link from 'next/link'
import { Sparkle } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProjectRuntimeState } from '@/realtime/project-runtime'
import type { RemotePresencePeer } from '@/lib/realtime/presence'
import { CanvasGuestList } from './canvas-guest-list'

interface CanvasToolbarProps {
  children: ReactNode
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

export function CanvasToolbar({ children, projectName, onProjectNameChange, readOnly = false, guests = [], onFollowGuest }: CanvasToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.parent === window) return
    const main = window.parent.document.querySelector('.nx-main')
    const actions = main?.querySelector('.nx-top .nx-actions')
    const menu = main?.querySelector('.nx-top .nx-burger')
    if (!main || !actions || !menu) return
    main.classList.add('nx-canvas-editor')
    const resize = () => {
      if (!toolbarRef.current) return
      toolbarRef.current.style.paddingRight = `${actions.getBoundingClientRect().width + 24}px`
      const menuWidth = menu.getBoundingClientRect().width
      toolbarRef.current.style.paddingLeft = `${menuWidth ? menuWidth + 24 : 16}px`
    }
    const observer = new ResizeObserver(resize)
    observer.observe(actions)
    observer.observe(menu)
    resize()
    return () => { observer.disconnect(); main.classList.remove('nx-canvas-editor') }
  }, [])
  const [editing, setEditing] = useState(false)
  // Typing edits a local draft; the name is saved on Enter or blur. Saving
  // every keystroke turned an emptied field into "Untitled Project" (the
  // document's fallback), so the last letter could never be deleted.
  const [draft, setDraft] = useState(projectName)
  const startEditing = () => {
    if (readOnly) return
    setDraft(projectName)
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    const next = draft.trim().slice(0, 120)
    if (next && next !== projectName) onProjectNameChange(next)
  }

  return (
    <div ref={toolbarRef} className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0b0c11]/85 px-2 sm:px-4 relative z-30">
      {/* Left */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-400 via-lime-400 to-emerald-400 text-slate-950 shadow-lg shadow-lime-500/10"><Sparkle size={16} weight="fill" /></div>
        <Link href="/" className="hidden lg:block text-xs font-medium text-slate-400 transition-colors hover:text-slate-100">Projects</Link>
        <div className="hidden lg:block w-px h-4 bg-border" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={120}
            aria-label="Project name"
            onChange={e => setDraft(e.target.value)}
            readOnly={readOnly}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(projectName); setEditing(false) }
            }}
            className="w-24 sm:w-40 bg-transparent border-none outline-none text-foreground text-base tracking-tight"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="max-w-24 truncate sm:max-w-40 text-sm font-semibold tracking-tight text-slate-200 transition-colors hover:text-sky-300 cursor-text"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">{children}</div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-1">
        {onFollowGuest && <CanvasGuestList peers={guests} onFollow={onFollowGuest} />}

      </div>
    </div>
  )
}
