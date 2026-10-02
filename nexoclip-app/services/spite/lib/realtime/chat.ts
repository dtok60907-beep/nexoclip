import * as Y from 'yjs'

// Project chat, stored in the realtime document so every collaborator sees it
// live and it survives reloads. It sits outside nodes/edges/meta, so the
// canvas UndoManager never tracks it.

export type ChatMessage = {
  id: string
  authorId: string
  name: string
  text: string
  createdAt: number
}

export const CHAT_ARRAY = 'chat'
export const MAX_CHAT_MESSAGES = 500
export const MAX_CHAT_MESSAGE_LENGTH = 2000
export const CHAT_ORIGIN = Symbol('canvas-chat')

export function chatArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>(CHAT_ARRAY)
}

function readMessage(entry: unknown): ChatMessage | null {
  if (!(entry instanceof Y.Map)) return null
  const id = entry.get('id')
  const authorId = entry.get('authorId')
  const text = entry.get('text')
  const createdAt = entry.get('createdAt')
  if (typeof id !== 'string' || typeof authorId !== 'string' || typeof text !== 'string' || typeof createdAt !== 'number') return null
  const name = entry.get('name')
  return { id, authorId, name: typeof name === 'string' && name.trim() ? name : 'Guest', text, createdAt }
}

export function readChat(doc: Y.Doc): ChatMessage[] {
  return chatArray(doc).toArray().map(readMessage).filter((message): message is ChatMessage => message !== null)
}

// Appends a message and drops the oldest beyond MAX_CHAT_MESSAGES. Returns
// the stored message, or null when the text is empty after trimming.
export function appendChatMessage(
  doc: Y.Doc,
  input: { authorId: string; name: string; text: string },
  { now = Date.now(), id = createMessageId(), max = MAX_CHAT_MESSAGES } = {},
): ChatMessage | null {
  const text = input.text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH)
  if (!text || !input.authorId) return null
  const message: ChatMessage = { id, authorId: input.authorId, name: input.name.trim() || 'Guest', text, createdAt: now }
  doc.transact(() => {
    const array = chatArray(doc)
    const entry = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(message)) entry.set(key, value)
    array.push([entry])
    const overflow = array.length - max
    if (overflow > 0) array.delete(0, overflow)
  }, CHAT_ORIGIN)
  return message
}

// Only the author can delete a message. Returns whether one was removed.
export function deleteChatMessage(doc: Y.Doc, messageId: string, authorId: string): boolean {
  let removed = false
  doc.transact(() => {
    const array = chatArray(doc)
    const index = array.toArray().findIndex((entry) => {
      const message = readMessage(entry)
      return message?.id === messageId && message.authorId === authorId
    })
    if (index >= 0) {
      array.delete(index, 1)
      removed = true
    }
  }, CHAT_ORIGIN)
  return removed
}

// Messages from others newer than the last time this browser read the chat.
export function countUnread(messages: ChatMessage[], lastReadAt: number, selfAuthorId: string | null): number {
  return messages.filter((message) => message.createdAt > lastReadAt && message.authorId !== selfAuthorId).length
}

function createMessageId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
