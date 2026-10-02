// Figma-style cursor messages: typing after `/` shows a bubble under your
// cursor for everyone in the room. Carried in awareness only — never stored.

export type CursorChatState = { text: string; open: boolean; updatedAt: number }

export const CURSOR_CHAT_MAX_LENGTH = 120
// How long a closed message stays visible to others.
export const CURSOR_CHAT_LINGER_MS = 5_000

export function createCursorChatState(text: string, open: boolean, now = Date.now()): CursorChatState {
  return { text: text.slice(0, CURSOR_CHAT_MAX_LENGTH), open, updatedAt: now }
}

// The text a peer's bubble should show right now, or undefined to hide it.
// Open bubbles always show (even empty, as "typing"); closed ones linger.
export function readCursorChat(value: unknown, now = Date.now()): { text: string; open: boolean } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { text, open, updatedAt } = value as Partial<CursorChatState>
  if (typeof text !== 'string' || typeof updatedAt !== 'number') return undefined
  const trimmed = text.slice(0, CURSOR_CHAT_MAX_LENGTH)
  if (open === true) return { text: trimmed, open: true }
  if (!trimmed.trim() || now - updatedAt > CURSOR_CHAT_LINGER_MS) return undefined
  return { text: trimmed, open: false }
}

// `/` opens cursor chat unless the user is typing somewhere already.
export function isCursorChatTrigger(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, target: unknown): boolean {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return false
  const element = target as { tagName?: string; isContentEditable?: boolean } | null
  const tag = element?.tagName?.toLowerCase()
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || element?.isContentEditable)
}
