import { readCursorChat, type CursorChatState } from './cursor-chat'

export type PresenceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type PresenceAwareness = {
  getLocalState?: () => Record<string, unknown> | null
  setLocalState?: (state: Record<string, unknown> | null) => void
  setLocalStateField?: (key: string, value: unknown) => void
}

export type PresencePoint = {
  x: number
  y: number
}

export type PresenceSelection = {
  nodeIds: string[]
}

export type PresenceEditing = {
  nodeId: string
}

export type PresenceLock = {
  nodeId: string
  observedAt?: number
  expiresAt?: number
}

export type LocalPresenceSnapshot = {
  selection: PresenceSelection
  editing: PresenceEditing | null
}

type PresenceElementLike = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => {
    getAttribute?: (name: string) => string | null | undefined
  } | null
}

export type PresenceColors = {
  cursor: string
  cursorMuted: string
  selection: string
  label: string
  text: string
}

export type PresencePeer = {
  clientId: number
  participantId?: unknown
  name?: unknown
  cursor?: unknown
  selection?: unknown
  editing?: unknown
  lock?: unknown
  sceneId?: unknown
  deviceId?: unknown
  cursorChat?: unknown
}

export type RemotePresencePeer = {
  clientId: number
  participantId: string
  name: string
  color: PresenceColors
  cursor?: PresencePoint
  selection: PresenceSelection
  editing?: PresenceEditing
  lock?: PresenceLock
  sceneId?: string
  // Shared by every tab of the same browser; used to tell "my other tab"
  // apart from another person.
  deviceId?: string
  // Cursor message to show under this peer's cursor right now.
  cursorChat?: { text: string; open: boolean }
}

export type PresenceControllerOptions = {
  awareness: PresenceAwareness | null
  participantId: string
  deviceId?: string
  throttleMs?: number
  heartbeatMs?: number
  now?: () => number
  setTimeout?: (callback: () => void, delayMs: number) => unknown
  clearTimeout?: (timer: unknown) => void
}

const PARTICIPANT_HINT_STORAGE_KEY = 'spite:participant-hint'
const DEVICE_HINT_STORAGE_KEY = 'spite:device-hint'
const DEFAULT_CURSOR_THROTTLE_MS = 48
const DEFAULT_LOCK_HEARTBEAT_MS = 2_000

export function getOrCreateParticipantHint(
  storage: PresenceStorage | undefined = getDefaultSessionStorage(),
  options: {
    key?: string
    createId?: () => string
  } = {},
): string {
  const key = options.key ?? PARTICIPANT_HINT_STORAGE_KEY
  const createId = options.createId ?? createParticipantId

  const existing = storage?.getItem(key)?.trim()
  if (existing) {
    return existing
  }

  const created = createId()
  storage?.setItem(key, created)
  return created
}

// Unlike the participant hint (sessionStorage, one per tab), the device hint
// lives in localStorage so all tabs of one browser share it.
export function getOrCreateDeviceHint(storage: PresenceStorage | undefined = getDefaultLocalStorage()): string {
  return getOrCreateParticipantHint(storage, { key: DEVICE_HINT_STORAGE_KEY })
}

export function getPresenceColor(participantId: string): PresenceColors {
  const hue = Math.abs(hashString(participantId)) % 360
  const cursor = `hsl(${hue} 78% 60%)`

  return {
    cursor,
    cursorMuted: `color-mix(in srgb, ${cursor} 72%, #080A0C)`,
    selection: `color-mix(in srgb, ${cursor} 24%, transparent)`,
    label: `color-mix(in srgb, ${cursor} 22%, #080A0C)`,
    text: '#F8FAFC',
  }
}

export function projectRemotePresence(
  peers: PresencePeer[],
  options: { now?: number } = {},
): RemotePresencePeer[] {
  const now = options.now ?? Date.now()

  return peers.map((peer) => {
    const participantId = readParticipantId(peer.participantId, peer.clientId)
    const selection = readSelection(peer.selection)
    const editing = readEditing(peer.editing)
    const lock = readActiveLock(peer.lock, now)

    return {
      clientId: peer.clientId,
      participantId,
      name: readDisplayName(peer.name),
      color: getPresenceColor(participantId),
      cursor: readPoint(peer.cursor),
      selection,
      editing,
      lock,
      sceneId: readSceneId(peer.sceneId),
      deviceId: typeof peer.deviceId === 'string' && peer.deviceId ? peer.deviceId : undefined,
      cursorChat: readCursorChat(peer.cursorChat, now),
    }
  })
}

export function createPresenceController(options: PresenceControllerOptions) {
  return new PresenceController(options)
}

export function createLocalPresenceSnapshot(
  nodeIds: string[],
  activeElement: unknown,
): LocalPresenceSnapshot {
  return {
    selection: {
      nodeIds: uniqueNodeIds(nodeIds),
    },
    editing: readEditingNodeIdFromTarget(activeElement),
  }
}

// Keeps our awareness state in step with the local selection/editing
// snapshot. Awareness emits 'update' synchronously from inside every write, and
// this runs on 'update', so it must not re-enter: publishing selection and
// editing as two writes let the nested call see a half-written state and
// publish again forever ("Maximum call stack size exceeded").
export function createPresenceSnapshotSync(options: {
  awareness: PresenceAwareness
  controller: { publishSnapshot(snapshot: LocalPresenceSnapshot): void }
  getSnapshot: () => LocalPresenceSnapshot
}): () => void {
  let syncing = false
  return () => {
    if (syncing) return
    syncing = true
    try {
      const snapshot = options.getSnapshot()
      if (!presenceSnapshotNeedsPublish(options.awareness.getLocalState?.(), snapshot)) return
      options.controller.publishSnapshot(snapshot)
    } finally {
      syncing = false
    }
  }
}

export function presenceSnapshotNeedsPublish(
  localState: Record<string, unknown> | null | undefined,
  snapshot: LocalPresenceSnapshot,
): boolean {
  const selection = readSelection(localState?.selection)
  const editing = readEditing(localState?.editing) ?? null

  if (selection.nodeIds.length !== snapshot.selection.nodeIds.length) {
    return true
  }

  for (let index = 0; index < selection.nodeIds.length; index += 1) {
    if (selection.nodeIds[index] !== snapshot.selection.nodeIds[index]) {
      return true
    }
  }

  return (editing?.nodeId ?? null) !== (snapshot.editing?.nodeId ?? null)
}

class PresenceController {
  private readonly awareness: PresenceAwareness | null
  private readonly participantId: string
  private readonly throttleMs: number
  private readonly heartbeatMs: number
  private readonly now: () => number
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown
  private readonly clearTimer: (timer: unknown) => void

  private lastCursorPublishedAt = Number.NEGATIVE_INFINITY
  private pendingCursor: PresencePoint | null | undefined
  private cursorTimer: unknown = null
  private activeLockNodeId: string | null = null
  private lockTimer: unknown = null

  constructor(options: PresenceControllerOptions) {
    this.awareness = options.awareness
    this.participantId = options.participantId
    this.throttleMs = options.throttleMs ?? DEFAULT_CURSOR_THROTTLE_MS
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_LOCK_HEARTBEAT_MS
    this.now = options.now ?? (() => Date.now())
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>))

    this.awareness?.setLocalState?.({
      ...(this.awareness.getLocalState?.() ?? {}),
      participantId: this.participantId,
      ...(options.deviceId ? { deviceId: options.deviceId } : {}),
    })
  }

  publishCursor(point: PresencePoint | null): void {
    if (point === null) {
      this.pendingCursor = null
      this.clearCursorTimer()
      this.writeField('cursor', null)
      this.lastCursorPublishedAt = Number.NEGATIVE_INFINITY
      return
    }

    const now = this.now()
    if (now - this.lastCursorPublishedAt >= this.throttleMs) {
      this.writeCursor(point)
      return
    }

    this.pendingCursor = point
    if (this.cursorTimer != null) {
      return
    }

    const waitMs = Math.max(0, this.throttleMs - (now - this.lastCursorPublishedAt))
    this.cursorTimer = this.setTimer(() => {
      this.cursorTimer = null
      const nextCursor = this.pendingCursor
      this.pendingCursor = undefined
      if (nextCursor) {
        this.writeCursor(nextCursor)
      }
    }, waitMs)
  }

  // Cursor message typed after `/`; null clears it.
  publishCursorChat(state: CursorChatState | null): void {
    this.writeField('cursorChat', state)
  }

  publishSelection(nodeIds: string[]): void {
    this.writeField('selection', {
      nodeIds: uniqueNodeIds(nodeIds),
    })
  }

  // One awareness write for both fields, so observers never see selection
  // updated while editing is still stale.
  publishSnapshot(snapshot: LocalPresenceSnapshot): void {
    const selection = { nodeIds: uniqueNodeIds(snapshot.selection.nodeIds) }
    const editing = snapshot.editing?.nodeId ? { nodeId: snapshot.editing.nodeId } : null
    const state = this.awareness?.getLocalState?.()
    if (state && this.awareness?.setLocalState) {
      this.awareness.setLocalState({ ...state, selection, editing })
      return
    }
    this.writeField('selection', selection)
    this.writeField('editing', editing)
  }

  publishEditing(nodeId: string | null): void {
    this.writeField('editing', nodeId ? { nodeId } : null)
  }

  publishScene(sceneId: string): void {
    this.writeField('sceneId', sceneId)
  }

  startDragLock(nodeId: string): void {
    this.activeLockNodeId = nodeId
    this.publishLock(nodeId)
    this.scheduleLockHeartbeat()
  }

  heartbeatDragLock(): void {
    if (!this.activeLockNodeId) {
      return
    }

    this.publishLock(this.activeLockNodeId)
  }

  stopDragLock(): void {
    this.activeLockNodeId = null
    this.clearLockTimer()
    this.writeField('lock', null)
  }

  destroy(): void {
    this.clearCursorTimer()
    this.clearLockTimer()
  }

  private writeCursor(point: PresencePoint): void {
    this.pendingCursor = undefined
    this.lastCursorPublishedAt = this.now()
    this.writeField('cursor', point)
  }

  private publishLock(nodeId: string): void {
    // `readActiveLock` (below) already knows how to expire a stale lock —
    // but only if we actually send `expiresAt`. Without it, a peer that
    // disconnects mid-drag (tab closed, network drop, crash) before
    // stopDragLock() can fire leaves its last-published `{ nodeId }` lock
    // sitting in shared awareness state forever, and every other client
    // reads that node as permanently held by someone else — exactly the
    // "sometimes I just can't drag this node" reports. 3x the heartbeat
    // interval gives normal jitter room to breathe while still clearing a
    // truly dead peer's lock quickly.
    this.writeField('lock', { nodeId, expiresAt: this.now() + this.heartbeatMs * 3 })
  }

  private scheduleLockHeartbeat(): void {
    this.clearLockTimer()
    this.lockTimer = this.setTimer(() => {
      this.lockTimer = null
      this.heartbeatDragLock()
      if (this.activeLockNodeId) {
        this.scheduleLockHeartbeat()
      }
    }, this.heartbeatMs)
  }

  private writeField(key: string, value: unknown): void {
    this.awareness?.setLocalStateField?.(key, value)
  }

  private clearCursorTimer(): void {
    if (this.cursorTimer == null) {
      return
    }

    this.clearTimer(this.cursorTimer)
    this.cursorTimer = null
  }

  private clearLockTimer(): void {
    if (this.lockTimer == null) {
      return
    }

    this.clearTimer(this.lockTimer)
    this.lockTimer = null
  }
}

function getDefaultLocalStorage(): PresenceStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function getDefaultSessionStorage(): PresenceStorage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

function createParticipantId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `participant-${Math.random().toString(36).slice(2, 10)}`
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
}

function readParticipantId(value: unknown, clientId: number): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : `client-${clientId}`
}

function readDisplayName(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'Guest'
}

function readSceneId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readPoint(value: unknown): PresencePoint | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const x = (value as { x?: unknown }).x
  const y = (value as { y?: unknown }).y
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }

  return { x, y }
}

function readEditingNodeIdFromTarget(target: unknown): PresenceEditing | null {
  const el = target as PresenceElementLike | null
  const tagName = el?.tagName?.toUpperCase()
  const isTextTarget = tagName === 'INPUT' || tagName === 'TEXTAREA' || el?.isContentEditable || !!el?.closest?.('[contenteditable="true"]')
  if (!isTextTarget) {
    return null
  }

  const nodeId = el?.closest?.('.react-flow__node')?.getAttribute?.('data-id') ?? null
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return null
  }

  return { nodeId }
}

function readSelection(value: unknown): PresenceSelection {
  if (!value || typeof value !== 'object') {
    return { nodeIds: [] }
  }

  const nodeIds = (value as { nodeIds?: unknown }).nodeIds
  if (!Array.isArray(nodeIds)) {
    return { nodeIds: [] }
  }

  return {
    nodeIds: uniqueNodeIds(nodeIds),
  }
}

function readEditing(value: unknown): PresenceEditing | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const nodeId = (value as { nodeId?: unknown }).nodeId
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return undefined
  }

  return { nodeId }
}

function readActiveLock(value: unknown, now: number): PresenceLock | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const nodeId = (value as { nodeId?: unknown }).nodeId
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return undefined
  }

  const expiresAt = (value as { expiresAt?: unknown }).expiresAt
  if (typeof expiresAt === 'number' && expiresAt <= now) {
    return undefined
  }

  return {
    nodeId,
    observedAt: typeof (value as { observedAt?: unknown }).observedAt === 'number'
      ? (value as { observedAt: number }).observedAt
      : undefined,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
  }
}

function uniqueNodeIds(nodeIds: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const nodeId of nodeIds) {
    if (typeof nodeId !== 'string' || nodeId.length === 0 || seen.has(nodeId)) {
      continue
    }

    seen.add(nodeId)
    result.push(nodeId)
  }

  return result
}
