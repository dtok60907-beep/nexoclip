'use client'

import { useEffect, useRef, useState } from 'react'
import { PaperPlaneRight, SpeakerHigh, SpeakerSlash, Trash, X } from '@phosphor-icons/react'

import { getPresenceColor } from '@/lib/realtime/presence'
import { MAX_CHAT_MESSAGE_LENGTH, type ChatMessage } from '@/lib/realtime/chat'

function formatTime(createdAt: number): string {
  const date = new Date(createdAt)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function ChatPanel({
  open, onClose, messages, selfId, canSend, readOnly, muted, onToggleMuted, onSend, onDelete,
}: {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  selfId: string | null
  canSend: boolean
  readOnly: boolean
  muted: boolean
  onToggleMuted: () => void
  onSend: (text: string) => boolean
  onDelete: (messageId: string) => void
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep the newest message in view.
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const submit = () => {
    if (onSend(draft)) setDraft('')
  }

  return (
    <div
      className="fixed right-0 top-12 bottom-0 z-30 flex w-80 flex-col border-l border-white/[0.06] glass"
      style={{ backdropFilter: 'blur(20px)' }}
      // Typing here must not trigger canvas shortcuts (Delete, /, …).
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/80">Mengobrol</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMuted}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            title={muted ? 'Unmute notification sound' : 'Mute notification sound'}
            aria-label={muted ? 'Unmute notification sound' : 'Mute notification sound'}
          >
            {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Close chat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-xs text-muted-foreground">No messages yet. Say hi to your collaborators.</p>
        ) : messages.map((message) => {
          const color = getPresenceColor(message.authorId)
          const own = message.authorId === selfId
          return (
            <div key={message.id} className="group">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color.cursor }} />
                <span className="truncate text-[11px] font-semibold text-foreground/90">{own ? `${message.name} (you)` : message.name}</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
                {own && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => onDelete(message.id)}
                    className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete message"
                    title="Delete message"
                  >
                    <Trash size={12} />
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words pl-4 text-[12px] leading-relaxed text-foreground/85">{message.text}</p>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {readOnly || !canSend ? (
          <p className="text-center text-[11px] text-muted-foreground">{readOnly ? 'Canvas is read-only right now.' : 'Sign in to chat.'}</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Message your collaborators…"
              className="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-white/20"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-900 transition-colors hover:bg-slate-100 disabled:opacity-40"
              aria-label="Send message"
            >
              <PaperPlaneRight size={14} weight="fill" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
