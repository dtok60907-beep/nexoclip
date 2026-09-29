'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowFatLineUp,
  Browser,
  FilmSlate,
  Folder,
  ImageSquare,
  MagnifyingGlass,
  Robot,
  SpeakerHigh,
  TextT,
} from '@phosphor-icons/react'

export type NodeMenuItem = {
  id: string
  label: string
  shortcut: string
  icon: React.ElementType
  category: string
  nodeType: string
  defaultModelId?: string
  color: string
  badge?: string
}

const QUICK_ITEMS: NodeMenuItem[] = [
  { id: 'prompt', label: 'Prompt', shortcut: 'T', icon: TextT, category: 'Quick', nodeType: 'prompt', color: '#595d6b' },
  { id: 'image-gen', label: 'Image Generator', shortcut: 'N', icon: ImageSquare, category: 'Quick', nodeType: 'imageGen', color: '#32a7c7' },
  { id: 'video-gen', label: 'Video Generator', shortcut: 'K', icon: FilmSlate, category: 'Quick', nodeType: 'videoGen', color: '#5661e8' },
  { id: 'voice-gen', label: 'Voice Generator', shortcut: '', icon: SpeakerHigh, category: 'Quick', nodeType: 'prompt', color: '#cf407c' },
  { id: 'assistant', label: 'LLM Assistant', shortcut: 'A', icon: Robot, category: 'Quick', nodeType: 'prompt', color: '#97a83d' },
  { id: 'page', label: 'Page', shortcut: '', icon: Browser, category: 'Quick', nodeType: 'prompt', color: '#42a86b', badge: 'New' },
]

const SECTION_ITEMS: NodeMenuItem[] = [
  { id: 'upload', label: 'Upload', shortcut: 'U', icon: ArrowFatLineUp, category: 'References', nodeType: 'reference', color: '#3fa86a' },
  { id: 'assets', label: 'Assets', shortcut: '', icon: Folder, category: 'References', nodeType: 'reference', color: '#3fa86a' },
  { id: 'image-gen-section', label: 'Image Generator', shortcut: '', icon: ImageSquare, category: 'Image', nodeType: 'imageGen', color: '#32a7c7' },
  { id: 'video-gen-section', label: 'Video Generator', shortcut: '', icon: FilmSlate, category: 'Video', nodeType: 'videoGen', color: '#5661e8' },
]

const ALL_ITEMS = [...QUICK_ITEMS, ...SECTION_ITEMS]

interface AddNodeMenuProps {
  x: number
  y: number
  onSelect: (item: NodeMenuItem) => void
  onClose: () => void
}

function MenuItem({ item, onSelect, onClose }: { item: NodeMenuItem; onSelect: (item: NodeMenuItem) => void; onClose: () => void }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); onSelect(item); onClose() }}
      className="group flex w-full items-center rounded-[10px] px-2 py-[5px] text-left transition-colors hover:bg-[#282b34]"
    >
      <span className="mr-2.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] text-white shadow-sm" style={{ background: item.color }}><Icon size={14} weight="bold" /></span>
      <span className="flex-1 text-[13.5px] font-semibold tracking-[-0.01em] text-[#e8ebf0]">{item.label}</span>
      {item.badge ? <span className="rounded-full bg-[#ccff00] px-2 py-[1.5px] text-[10px] font-bold leading-tight text-black shadow-sm">{item.badge}</span> : null}
    </button>
  )
}

export function AddNodeMenu({ x, y, onSelect, onClose }: AddNodeMenuProps) {
  const [search, setSearch] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  const clampToViewport = () => {
    const element = menuRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    })
  }

  useLayoutEffect(clampToViewport, [x, y])
  useEffect(() => {
    inputRef.current?.focus()
    const handleResize = () => clampToViewport()
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const handlePointerDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('resize', handleResize)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [onClose, x, y])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? ALL_ITEMS.filter(item => item.label.toLowerCase().includes(query)) : ALL_ITEMS
  }, [search])
  const quick = filtered.filter(item => item.category === 'Quick')
  const sections = ['References', 'Image', 'Video']

  return (
    <div
      ref={menuRef}
      data-purpose="context-menu-wrapper"
      className="fixed z-50 flex w-[264px] select-none flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#1e2025] p-[9px] text-[#f2f4f8] shadow-[0_20px_48px_-8px_rgba(0,0,0,0.7),0_8px_16px_-4px_rgba(0,0,0,0.5)]"
      style={{ left: pos.left, top: pos.top, maxHeight: 'calc(100vh - 16px)' }}
      onWheel={event => event.stopPropagation()}
    >
      <div className="mb-1.5 flex h-9 w-full items-center gap-2 rounded-xl border border-white/[0.04] bg-[#2a2d35]/95 px-3 transition-all focus-within:border-white/20">
        <MagnifyingGlass size={15} weight="bold" className="shrink-0 text-[#717786]" />
        <input ref={inputRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" className="w-full border-0 bg-transparent p-0 text-[13.5px] font-normal tracking-[-0.01em] text-[#f2f4f8] outline-none placeholder:text-[#727888] focus:ring-0" />
      </div>

      <div className="menu-scroll flex max-h-[460px] flex-col space-y-[2px] overflow-y-auto">
        {quick.map(item => <MenuItem key={item.id} item={item} onSelect={onSelect} onClose={onClose} />)}
        {sections.map(section => {
          const items = filtered.filter(item => item.category === section)
          if (items.length === 0) return null
          return <div key={section}><div className="px-2 pb-0.5 pt-2 text-[11px] font-bold tracking-tight text-[#6d7380]">{section}</div>{items.map(item => <MenuItem key={item.id} item={item} onSelect={onSelect} onClose={onClose} />)}</div>
        })}
        {filtered.length === 0 ? <div className="px-3 py-6 text-center text-xs text-[#727888]">No results</div> : null}
      </div>
    </div>
  )
}
