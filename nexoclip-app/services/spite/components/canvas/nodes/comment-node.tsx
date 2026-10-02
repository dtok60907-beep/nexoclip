'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ArrowCounterClockwise, Check, MapPin, PaperPlaneRight, PencilSimple, Trash } from '@phosphor-icons/react'

import { useCanvasCollaboration } from '../canvas-collaboration'
import { useCurrentUser } from '@/hooks/use-current-user'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'
import { getPresenceColor } from '@/lib/realtime/presence'
import {
  MAX_COMMENT_LENGTH,
  addCommentEntry,
  deleteCommentEntry,
  editCommentEntry,
  readCommentData,
} from '@/lib/comment-thread'

function formatTime(createdAt: number): string {
  if (!createdAt) return ''
  const date = new Date(createdAt)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

// A comment pin: a location marker on the canvas. Hover shows the thread,
// click keeps it open to reply. Deleting the pin goes through the normal
// node delete (Delete key, or "Delete thread" here), never a page action.
function CommentNodeImpl({ id, data, selected }: NodeProps) {
  const { deleteNodes, patchNodeData, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const user = useCurrentUser()
  const comment = useMemo(() => readCommentData(data as Record<string, unknown>), [data])
  const isNewByMe = comment.thread.length === 0 && Boolean(user) && comment.createdBy === user?.id
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // A pin you just dropped opens straight into the composer.
  useEffect(() => {
    if (isNewByMe) setPinned(true)
  }, [isNewByMe])

  // Closing the thread when the pin loses selection keeps the board tidy.
  useEffect(() => {
    if (!selected && !isNewByMe) setPinned(false)
  }, [isNewByMe, selected])

  const open = pinned || hovered
  const color = getPresenceColor(comment.createdBy || comment.thread[0]?.authorId || id)
  const canWrite = allowDocumentMutation && Boolean(user)

  const send = () => {
    if (!user) return
    const patch = addCommentEntry(comment, user, draft)
    if (!patch) return
    patchNodeData(id, patch)
    setDraft('')
  }

  const cancelEmpty = () => {
    // An empty pin you cancel is removed, like closing an unsent comment.
    if (comment.thread.length === 0 && allowDocumentMutation) deleteNodes([id])
    else setPinned(false)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => setPinned((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
        aria-label={`Comment by ${comment.thread[0]?.name ?? 'you'}${comment.resolved ? ' (resolved)' : ''}`}
        aria-expanded={open}
      >
        <MapPin
          size={34}
          weight="fill"
          style={{ color: comment.resolved ? '#64748b' : color.cursor, filter: selected ? 'brightness(1.2)' : undefined }}
        />
        <span className="absolute top-[7px] flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#0b0c11] px-0.5 text-[8px] font-bold text-white">
          {comment.resolved ? <Check size={8} weight="bold" /> : comment.thread.length || '+'}
        </span>
      </button>

      {open ? (
        <div
          className="nodrag nopan nowheel absolute left-10 top-0 z-50 w-72 rounded-2xl border border-white/10 bg-[#15171d]/95 p-3 text-slate-100 shadow-2xl backdrop-blur-xl"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') cancelEmpty()
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="max-h-64 space-y-2.5 overflow-y-auto">
            {comment.thread.map((entry) => {
              const own = Boolean(user) && entry.authorId === user?.id
              return (
                <div key={entry.id} className="group/entry">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: getPresenceColor(entry.authorId || id).cursor }} />
                    <span className="truncate text-[11px] font-semibold">{entry.name}</span>
                    <span className="text-[10px] text-slate-500">{formatTime(entry.createdAt)}{entry.editedAt ? ' · edited' : ''}</span>
                    {own && canWrite && editing?.id !== entry.id ? (
                      <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover/entry:opacity-100">
                        <button type="button" onClick={() => setEditing({ id: entry.id, text: entry.text })} className="text-slate-500 hover:text-slate-200" aria-label="Edit comment"><PencilSimple size={11} /></button>
                        <button type="button" onClick={() => { const patch = deleteCommentEntry(comment, entry.id, user!.id); if (patch) patchNodeData(id, patch) }} className="text-slate-500 hover:text-red-400" aria-label="Delete comment"><Trash size={11} /></button>
                      </span>
                    ) : null}
                  </div>
                  {editing?.id === entry.id ? (
                    <textarea
                      autoFocus
                      value={editing.text}
                      maxLength={MAX_COMMENT_LENGTH}
                      onChange={(event) => setEditing({ id: entry.id, text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          const patch = editCommentEntry(comment, entry.id, user!.id, editing.text)
                          if (patch) patchNodeData(id, patch)
                          setEditing(null)
                        } else if (event.key === 'Escape') {
                          event.stopPropagation()
                          setEditing(null)
                        }
                      }}
                      className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[12px] outline-none"
                      rows={2}
                    />
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[12px] leading-relaxed text-slate-200">{entry.text}</p>
                  )}
                </div>
              )
            })}
          </div>

          {canWrite ? (
            <div className={`flex items-end gap-2 ${comment.thread.length ? 'mt-3 border-t border-white/[0.06] pt-3' : ''}`}>
              <textarea
                ref={inputRef}
                autoFocus={isNewByMe}
                value={draft}
                maxLength={MAX_COMMENT_LENGTH}
                rows={1}
                placeholder={comment.thread.length ? 'Reply…' : 'Add a comment…'}
                onFocus={() => setPinned(true)}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send()
                  }
                }}
                className="max-h-28 min-h-[32px] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] outline-none placeholder:text-slate-500 focus:border-white/20"
              />
              <button type="button" onClick={send} disabled={!draft.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-900 disabled:opacity-40" aria-label="Send comment">
                <PaperPlaneRight size={12} weight="fill" />
              </button>
            </div>
          ) : null}

          {canWrite && comment.thread.length > 0 ? (
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => patchNodeData(id, { resolved: !comment.resolved })}
                className="flex items-center gap-1 text-slate-400 hover:text-emerald-300"
              >
                {comment.resolved ? <><ArrowCounterClockwise size={11} /> Reopen</> : <><Check size={11} /> Resolve</>}
              </button>
              <button type="button" onClick={() => deleteNodes([id])} className="flex items-center gap-1 text-slate-500 hover:text-red-400">
                <Trash size={11} /> Delete thread
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export const CommentNode = memo(CommentNodeImpl)
CommentNode.displayName = 'CommentNode'
