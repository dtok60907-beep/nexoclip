// Comment pin threads, stored in the comment node's data. Each entry is its
// own data key (`c:<id>`): node data syncs key by key, so two people replying
// at once both keep their reply instead of one overwriting a shared array.
// Every function returns the data patch to write.

export type CommentEntry = {
  id: string
  authorId: string
  name: string
  text: string
  createdAt: number
  editedAt?: number
}

export type CommentData = {
  thread: CommentEntry[]
  resolved: boolean
  createdBy?: string
}

export const MAX_COMMENT_LENGTH = 2000
export const COMMENT_ENTRY_PREFIX = 'c:'
const entryKey = (id: string) => `${COMMENT_ENTRY_PREFIX}${id}`
type Patch = Record<string, unknown>

function readEntry(value: unknown): CommentEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<CommentEntry>
  if (typeof entry.id !== 'string' || typeof entry.text !== 'string' || typeof entry.createdAt !== 'number') return null
  return {
    id: entry.id,
    authorId: typeof entry.authorId === 'string' ? entry.authorId : '',
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : 'Guest',
    text: entry.text,
    createdAt: entry.createdAt,
    ...(typeof entry.editedAt === 'number' ? { editedAt: entry.editedAt } : {}),
  }
}

// Comments from before the thread model stored a single `text` string.
export function readCommentData(data: Record<string, unknown> | undefined | null): CommentData {
  const thread = Object.entries(data ?? {})
    .filter(([key]) => key.startsWith(COMMENT_ENTRY_PREFIX))
    .map(([, value]) => readEntry(value))
    .filter((entry): entry is CommentEntry => entry !== null)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  if (thread.length === 0 && typeof data?.text === 'string' && data.text.trim()) {
    thread.push({ id: 'legacy', authorId: '', name: 'Guest', text: data.text, createdAt: 0 })
  }
  return {
    thread,
    resolved: data?.resolved === true,
    ...(typeof data?.createdBy === 'string' ? { createdBy: data.createdBy } : {}),
  }
}

export function addCommentEntry(
  data: CommentData,
  author: { id: string; name: string },
  text: string,
  { now = Date.now(), id = createEntryId() } = {},
): Patch | null {
  const clean = text.trim().slice(0, MAX_COMMENT_LENGTH)
  if (!clean) return null
  return { [entryKey(id)]: { id, authorId: author.id, name: author.name || 'Guest', text: clean, createdAt: now } }
}

// Only an entry's author can edit or delete it.
export function editCommentEntry(data: CommentData, entryId: string, authorId: string, text: string, now = Date.now()): Patch | null {
  const clean = text.trim().slice(0, MAX_COMMENT_LENGTH)
  const entry = data.thread.find((candidate) => candidate.id === entryId)
  if (!clean || !entry || entry.authorId !== authorId) return null
  return { [entryKey(entryId)]: { ...entry, text: clean, editedAt: now } }
}

// `undefined` removes the key in patchNodeData.
export function deleteCommentEntry(data: CommentData, entryId: string, authorId: string): Patch | null {
  const entry = data.thread.find((candidate) => candidate.id === entryId)
  if (!entry || entry.authorId !== authorId) return null
  return { [entryKey(entryId)]: undefined }
}

function createEntryId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
