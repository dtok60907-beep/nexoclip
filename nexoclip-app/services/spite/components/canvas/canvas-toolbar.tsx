'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
  jobsPanelOpen?: boolean
  onToggleJobsPanel?: () => void
  activeJobCount?: number
  guests?: RemotePresencePeer[]
  onFollowGuest?: (peer: RemotePresencePeer) => void
}

export function CanvasToolbar({
  children,
  projectName,
  onProjectNameChange,
  readOnly = false,
  guests = [],
  onFollowGuest,
}: CanvasToolbarProps) {
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
    return () => {
      observer.disconnect()
      main.classList.remove('nx-canvas-editor')
    }
  }, [])

  const [editing, setEditing] = useState(false)
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
    <header
      ref={toolbarRef}
      className="relative z-30 flex h-12 shrink-0 select-none items-center gap-3 border-b border-zinc-200/85 bg-white/95 px-3 sm:px-4"
    >
      {/* Left: Back to Projects + Editable Project Title */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/"
          className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          <span>Projects</span>
        </Link>
        <div className="hidden lg:block h-4 w-px bg-zinc-200" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={120}
            aria-label="Project name"
            onChange={(e) => setDraft(e.target.value)}
            readOnly={readOnly}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(projectName)
                setEditing(false)
              }
            }}
            className="w-32 sm:w-44 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[13px] font-semibold tracking-tight text-zinc-900 outline-none focus:border-zinc-500"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="max-w-32 truncate sm:max-w-48 rounded-lg px-2 py-1 text-[13px] font-semibold tracking-tight text-zinc-900 transition-colors hover:bg-zinc-100 cursor-text"
            title="Click to rename project"
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Center: Compact Scene Strip */}
      <div className="min-w-0 flex-1 flex items-center justify-start sm:justify-center">
        {children}
      </div>

      {/* Right: Collaborators */}
      <div className="flex shrink-0 items-center gap-1">
        {onFollowGuest && <CanvasGuestList peers={guests} onFollow={onFollowGuest} />}
      </div>
    </header>
  )
}
