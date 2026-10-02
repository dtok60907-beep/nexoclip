'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type * as Y from 'yjs'

import { playChatChime } from '@/lib/chat-sound'
import { appendChatMessage, chatArray, countUnread, deleteChatMessage, readChat, type ChatMessage } from '@/lib/realtime/chat'
import type { CurrentUser } from './use-current-user'

const readKey = (projectId: string) => `spite:chat-read:${projectId}`
const MUTE_KEY = 'spite:chat-muted'

function readNumber(key: string): number {
  try { return Number(window.localStorage.getItem(key)) || 0 } catch { return 0 }
}

export function useCanvasChat({ doc, projectId, user, open }: {
  doc: Y.Doc | null
  projectId: string
  user: CurrentUser | null
  open: boolean
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastReadAt, setLastReadAt] = useState(0)
  const [muted, setMuted] = useState(false)
  const knownIdsRef = useRef<Set<string> | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = user?.id ?? null

  useEffect(() => {
    setLastReadAt(readNumber(readKey(projectId)))
    try { setMuted(window.localStorage.getItem(MUTE_KEY) === '1') } catch { /* storage blocked */ }
  }, [projectId])

  useEffect(() => {
    if (!doc) return
    const array = chatArray(doc)
    const update = () => {
      const next = readChat(doc)
      // Chime for messages from others that arrive while the panel is closed
      // or the tab is in the background; the first read after load is silent.
      const known = knownIdsRef.current
      if (known && !mutedRef.current && (!openRef.current || document.hidden)) {
        if (next.some((message) => !known.has(message.id) && message.authorId !== userIdRef.current)) playChatChime()
      }
      knownIdsRef.current = new Set(next.map((message) => message.id))
      setMessages(next)
    }
    update()
    array.observeDeep(update)
    return () => array.unobserveDeep(update)
  }, [doc])

  const markRead = useCallback(() => {
    const newest = messages.reduce((latest, message) => Math.max(latest, message.createdAt), 0)
    if (newest <= lastReadAt) return
    setLastReadAt(newest)
    try { window.localStorage.setItem(readKey(projectId), String(newest)) } catch { /* storage blocked */ }
  }, [lastReadAt, messages, projectId])

  // Reading the open panel counts as reading every message in it.
  useEffect(() => {
    if (open && !document.hidden) markRead()
  }, [markRead, open])

  const send = useCallback((text: string) => {
    if (!doc || !user) return false
    return appendChatMessage(doc, { authorId: user.id, name: user.name, text }) !== null
  }, [doc, user])

  const remove = useCallback((messageId: string) => {
    if (doc && user) deleteChatMessage(doc, messageId, user.id)
  }, [doc, user])

  const toggleMuted = useCallback(() => {
    setMuted((value) => {
      const next = !value
      try { window.localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch { /* storage blocked */ }
      return next
    })
  }, [])

  return {
    messages,
    unread: open ? 0 : countUnread(messages, lastReadAt, user?.id ?? null),
    send,
    remove,
    muted,
    toggleMuted,
    canSend: Boolean(doc && user),
  }
}
