'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
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
    <div ref={toolbarRef} className="relative z-30 flex h-13 shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-[#161618]/95 px-2 sm:px-4">
      {/* Left */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700/80 bg-[#1c1c1e] text-zinc-100"><Sparkles size={14} strokeWidth={1.8} /></div>
        <Link href="/" className="hidden lg:block text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100">Projects</Link>
        <div className="hidden lg:block h-4 w-px bg-zinc-800" />
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
