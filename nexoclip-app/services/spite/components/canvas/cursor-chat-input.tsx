'use client'

import { useEffect, useRef, useState } from 'react'

import {
  CURSOR_CHAT_LINGER_MS,
  CURSOR_CHAT_MAX_LENGTH,
  createCursorChatState,
  isCursorChatTrigger,
  type CursorChatState,
} from '@/lib/realtime/cursor-chat'
import { getPresenceColor } from '@/lib/realtime/presence'

// `/` opens a message bubble that follows your cursor; collaborators see it
// live under your cursor. Enter or Esc closes it; others keep seeing the last
// text for a few seconds, then it clears.
export function CursorChatInput({ enabled, participantId, onPublish }: {
  enabled: boolean
  participantId: string
  onPublish: (state: CursorChatState | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const pointerRef = useRef({ x: 0, y: 0 })
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishRef = useRef(onPublish)
  publishRef.current = onPublish

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (open) setPosition(pointerRef.current)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [open])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (open || !isCursorChatTrigger(event, event.target)) return
      event.preventDefault()
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      setPosition(pointerRef.current)
      setText('')
      setOpen(true)
      publishRef.current(createCursorChatState('', true))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, open])

  useEffect(() => () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
  }, [])

  const close = () => {
    setOpen(false)
    publishRef.current(createCursorChatState(text, false))
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => publishRef.current(null), CURSOR_CHAT_LINGER_MS)
  }

  if (!open) return null
  const color = getPresenceColor(participantId)

  return (
    <div
      className="pointer-events-none fixed z-[60]"
      style={{ left: position.x, top: position.y, transform: 'translate(14px, 18px)' }}
    >
      <input
        autoFocus
        value={text}
        maxLength={CURSOR_CHAT_MAX_LENGTH}
        placeholder="Say something…"
        onChange={(event) => {
          setText(event.target.value)
          publishRef.current(createCursorChatState(event.target.value, true))
        }}
        onKeyDown={(event) => {
          // Keep canvas shortcuts (Delete, V, H, …) out of the message.
          event.stopPropagation()
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
        onBlur={close}
        aria-label="Cursor message"
        className="pointer-events-auto w-64 rounded-2xl rounded-tl-sm border-none px-3 py-1.5 text-[12px] font-medium shadow-lg outline-none placeholder:text-black/50"
        style={{ background: color.cursor, color: '#0b0c11' }}
      />
    </div>
  )
}
