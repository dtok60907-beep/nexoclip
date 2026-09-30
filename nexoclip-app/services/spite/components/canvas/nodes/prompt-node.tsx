'use client'

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Position, NodeProps, Handle, NodeResizer } from '@xyflow/react'
import { TextT } from '@phosphor-icons/react'
import { SimpleNodeToolbar } from './node-toolbar'
import { MentionTextarea, type Mention, type MentionTextareaRef } from '../mention-textarea'
import { useProjectFolders } from '@/hooks/use-project-folders'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { createLocalStateSyncGuard } from '@/lib/local-state-sync'
import {
  acknowledgePendingMentionState,
  hasPersistedMentionConflict,
  mentionStateKey,
  shouldApplyRemoteMentionState,
} from '@/lib/mention-state'
import { withBasePath } from '@/lib/base-path'
import { getOrCreateParticipantHint } from '@/lib/realtime/presence'

function HandleIcon({ icon: Icon, color, style }: { icon: React.ElementType; color: string; style?: React.CSSProperties }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#111316',
        border: `1.5px solid ${color}`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <Icon size={10} weight="bold" style={{ color }} />
    </div>
  )
}

function PromptNodeImpl({ id, data, selected }: NodeProps) {
  const params = useParams()
  const projectId = params.id as string | undefined
  const [text, setText] = useState((data.text as string) || '')
  const [mentions, setMentions] = useState<Mention[]>((data.mentions as Mention[]) || [])
  const [nodeHeight, setNodeHeight] = useState(typeof data.height === 'number' ? data.height : 500)
  const nodeHeightRef = useRef(nodeHeight)
  // Mirrors nodeHeight: width must also be driven by local state during a
  // resize drag. Reading it straight from `data.width` (as this used to)
  // only updates once the resize is persisted and echoes back through the
  // collaboration round-trip, which is why dragging looked frozen until
  // mouseup.
  const [nodeWidth, setNodeWidth] = useState(typeof data.width === 'number' ? data.width : 620)
  const nodeWidthRef = useRef(nodeWidth)
  const { folders, refresh: refreshFolders } = useProjectFolders(projectId)
  const { patchNodeData, persistenceStatus } = useCanvasCollaboration()
  const locked = Boolean(data.locked)
  // Collaboration-degraded read-only and a manual per-node lock both mean
  // "don't let this node be edited right now" — reusing readOnly for both
  // means every existing gate below (enterEdit, handleChange, the disabled
  // textarea) already respects a lock without a second set of checks.
  const readOnly = persistenceStatus === 'READ_ONLY' || locked
  // Drag-by-default UX: when `editing` is false, an invisible overlay
  // sits on top of the text and absorbs single-clicks so React Flow
  // treats them as a node drag. Double-click anywhere on the overlay
  // enters edit mode — the overlay disappears, the contentEditable
  // takes focus, and the user can type / select chips normally.
  // Clicking outside the card (or pressing Escape) exits edit mode.
  const [editing, setEditing] = useState(false)
  const [claimingEditorLock, setClaimingEditorLock] = useState(false)
  const [editorLockError, setEditorLockError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MentionTextareaRef>(null)
  const syncGuardRef = useRef(createLocalStateSyncGuard())
  const pendingLocalStateKeyRef = useRef<string | null>(null)
  const unpersistedLocalStateKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const incomingText = (data.text as string) || ''
    const incomingMentions = (data.mentions as Mention[]) || []
    const incomingStateKey = mentionStateKey(incomingText, incomingMentions)
    // Keep a local draft pending until the shared Yjs projection echoes the
    // exact text + mention metadata. Closing the editor is not an ACK: clearing
    // here used to let the previous projection overwrite the draft on blur,
    // which then became the state restored after refresh.
    pendingLocalStateKeyRef.current = acknowledgePendingMentionState(
      pendingLocalStateKeyRef.current,
      incomingStateKey,
    )
    const persistedConflict = hasPersistedMentionConflict(
      unpersistedLocalStateKeyRef.current,
      incomingStateKey,
      persistenceStatus,
    )
    if (
      unpersistedLocalStateKeyRef.current === incomingStateKey
      && (persistenceStatus === 'PERSISTED' || persistenceStatus === 'SYNCED')
    ) {
      unpersistedLocalStateKeyRef.current = null
    }
    if (!persistedConflict && !shouldApplyRemoteMentionState({
      editing,
      pendingLocalStateKey: pendingLocalStateKeyRef.current,
      localText: text,
      localMentions: mentions,
      incomingText,
      incomingMentions,
    })) return

    if (persistedConflict) {
      pendingLocalStateKeyRef.current = null
      unpersistedLocalStateKeyRef.current = null
      setEditing(false)
      setEditorLockError('Prompt changed concurrently. The latest saved version is shown; review it before generating.')
    }
    const finishSync = syncGuardRef.current.beginPropSync()
    setText(incomingText)
    setMentions(incomingMentions)
    queueMicrotask(finishSync)
  }, [data.text, data.mentions, editing, mentions, persistenceStatus, text])

  useEffect(() => {
    if (typeof data.height !== 'number' || data.height === nodeHeightRef.current) return
    nodeHeightRef.current = data.height
    setNodeHeight(data.height)
  }, [data.height])

  useEffect(() => {
    if (typeof data.width !== 'number' || data.width === nodeWidthRef.current) return
    nodeWidthRef.current = data.width
    setNodeWidth(data.width)
  }, [data.width])

  const handleContentHeightChange = useCallback((contentHeight: number) => {
    const desiredHeight = Math.max(180, Math.min(900, Math.ceil(contentHeight + 8)))
    if (desiredHeight <= nodeHeightRef.current + 2) return
    nodeHeightRef.current = desiredHeight
    setNodeHeight(desiredHeight)
    patchNodeData(id, { height: desiredHeight })
  }, [id, patchNodeData])

  const handleChange = useCallback((nextText: string, nextMentions: Mention[]) => {
    if (readOnly) {
      setEditorLockError(locked ? 'This node is locked. Unlock it to edit.' : 'Canvas is read-only. Reconnect before editing.')
      return
    }
    syncGuardRef.current.beginUserEdit()
    setText(nextText)
    setMentions(nextMentions)
    const nextStateKey = mentionStateKey(nextText, nextMentions)
    pendingLocalStateKeyRef.current = nextStateKey
    unpersistedLocalStateKeyRef.current = nextStateKey
    if (!syncGuardRef.current.allowsPersistence()) return
    patchNodeData(id, { text: nextText, mentions: nextMentions })
  }, [id, patchNodeData, readOnly])

  const participantIdRef = useRef<string | null>(null)
  // Status, not just ok/fail: callers need to tell "someone else genuinely
  // holds the lock" (409 — real conflict) apart from a transient failure
  // (network blip, auth-check timeout, db hiccup — anything else). Losing
  // that distinction is what made the heartbeat below kick people out of
  // an in-progress edit on a single flaky request.
  const sendEditorLock = useCallback(async (action: 'claim' | 'heartbeat' | 'release') => {
    if (!projectId) return { ok: false, status: 0 }
    const participantId = participantIdRef.current ?? getOrCreateParticipantHint()
    participantIdRef.current = participantId
    try {
      const response = await fetch(withBasePath(`/api/projects/${encodeURIComponent(projectId)}/prompt-editor-lock`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, nodeId: id, participantId }),
      })
      return { ok: response.ok, status: response.status }
    } catch {
      // Network-level failure (offline, DNS hiccup, etc.) — same "transient,
      // not a real conflict" bucket as a 5xx.
      return { ok: false, status: 0 }
    }
  }, [id, projectId])

  useEffect(() => {
    if (!editing) return
    // Lease is 15s server-side (NODE_LOCK_LEASE_SECONDS in
    // lib/prompt-editor-lock.ts) and we poll every 5s, i.e. up to two
    // heartbeats can be lost before the lock actually expires. Only bail
    // out of editing on a definitive 409 (another participant holds it) or
    // once we've burned through that margin — not on the first blip.
    let consecutiveFailures = 0
    const heartbeat = window.setInterval(() => {
      void sendEditorLock('heartbeat').then(({ ok, status }) => {
        if (ok) {
          consecutiveFailures = 0
          return
        }
        if (status === 409) {
          setEditorLockError('Editor lock expired. Please open the node again.')
          setEditing(false)
          return
        }
        consecutiveFailures += 1
        if (consecutiveFailures >= 3) {
          setEditorLockError('Losing connection to the editor lock. Please open the node again.')
          setEditing(false)
        }
      })
    }, 5_000)
    return () => {
      window.clearInterval(heartbeat)
      void sendEditorLock('release')
    }
  }, [editing, sendEditorLock])

  // Exit editing when the user clicks anywhere outside this card.
  useEffect(() => {
    if (!editing) return
    const handleMouse = (e: MouseEvent) => {
      const target = e.target as Node
      // The @mention menu and chip popover render in a portal outside the
      // card. React's stopPropagation doesn't stop this document listener
      // (React also listens on document), so treat them as inside.
      const inMentionUi = target instanceof Element && Boolean(target.closest('[data-mention-menu],[data-mention-popover]'))
      if (!cardRef.current?.contains(target) && !inMentionUi) setEditing(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false)
    }
    document.addEventListener('mousedown', handleMouse)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouse)
      document.removeEventListener('keydown', handleKey)
    }
  }, [editing])

  const enterEdit = async () => {
    if (readOnly) {
      setEditorLockError(locked ? 'This node is locked. Unlock it to edit.' : 'Canvas is read-only. Reconnect before editing.')
      return
    }
    if (editing || claimingEditorLock) return
    setClaimingEditorLock(true)
    setEditorLockError(null)
    try {
      const { ok, status } = await sendEditorLock('claim')
      if (!ok) {
        setEditorLockError(
          status === 409
            ? 'Prompt ini sedang diedit oleh user lain.'
            : 'Tidak bisa mengunci editor (koneksi bermasalah). Coba lagi.',
        )
        return
      }
      void refreshFolders()
      setEditing(true)
      // Defer focus until after the overlay unmounts so the editor div
      // can actually receive focus.
      setTimeout(() => editorRef.current?.focus(), 0)
    } catch {
      setEditorLockError('Tidak bisa mengunci editor. Coba lagi.')
    } finally {
      setClaimingEditorLock(false)
    }
  }

  return (
    <div
      className="relative group"
      style={{
        width: nodeWidth,
        height: nodeHeight,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={180}
        maxWidth={900}
        maxHeight={900}
        lineStyle={{ borderColor: '#1597ff', borderWidth: 1 }}
        handleStyle={{ backgroundColor: '#ffffff', border: '1.5px solid #1597ff', borderRadius: 2, width: 9, height: 9 }}
        onResize={(_, params) => {
          // Live drag feedback: update local state on every frame so the
          // card tracks the pointer. Not persisted here — patchNodeData on
          // every mousemove would spam the collaboration channel; that only
          // happens once, below, when the gesture ends.
          nodeWidthRef.current = params.width
          nodeHeightRef.current = params.height
          setNodeWidth(params.width)
          setNodeHeight(params.height)
        }}
        onResizeEnd={(_, params) => {
          nodeWidthRef.current = params.width
          nodeHeightRef.current = params.height
          setNodeWidth(params.width)
          setNodeHeight(params.height)
          patchNodeData(id, { width: params.width, height: params.height })
        }}
      />
      <SimpleNodeToolbar nodeId={id} selected={selected} locked={locked} />

      {/* Node label */}
      <div className="absolute -top-6 left-0 text-[10px] font-mono text-muted-foreground/60 whitespace-nowrap pointer-events-none">
        {(data.label as string)?.replace(/^Text(?: Input)?/i, 'Prompt') || 'Prompt'}
      </div>

      {/* Output handle (card height ~170px). zIndex:5 matches the image
          and video nodes — keeps drag-origin detection robust against
          card content that might be added later. */}
      <Handle type="source" id="prompt-out" position={Position.Right} style={{ top: 85, right: 0, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
      <HandleIcon icon={TextT} color="rgba(107,143,168,0.8)" style={{ top: 85, left: '100%' }} />

      {/* Card content */}
      <div
        ref={cardRef}
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-[#161a22] transition-all duration-200 ${selected ? 'border-transparent' : 'border-[#2b313e]'}`}
        style={{ boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.7)' }}
      >
        <MentionTextarea
          ref={editorRef}
          value={text}
          mentions={mentions}
          onChange={handleChange}
          folders={folders}
          placeholder="Type your prompt here..."
          className="nodrag custom-scrollbar w-full flex-1 resize-none bg-transparent p-6 text-[16px] leading-[1.65] text-slate-300 outline-none placeholder:text-[16px] placeholder:text-slate-500 cursor-text"
          disabled={readOnly}
          rows={6}
          onContentHeightChange={handleContentHeightChange}
        />

        {editorLockError && (
          <div className="absolute left-3 right-3 bottom-3 rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200 pointer-events-none">
            {editorLockError}
          </div>
        )}

        {/* Drag-capture overlay. When not editing, this sits on top of
            the textarea, intercepts single-clicks, and — because it
            doesn't carry `nodrag` — lets React Flow start a node drag
            from any mousedown on the card. Double-click flips into
            edit mode and the overlay unmounts so the contentEditable
            below takes over. */}
        {!editing && (
          <div
            className="absolute inset-0"
            onDoubleClick={() => { void enterEdit() }}
            title={claimingEditorLock ? 'Claiming editor lock…' : locked ? 'This node is locked' : 'Double-click to edit · drag to move'}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grabbing' }}
            onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grab' }}
          />
        )}
      </div>
    </div>
  )
}

// React.memo skips re-renders when the props (id, data, selected, etc.)
// from React Flow are referentially equal. ReactFlow only swaps a node's
// `data` reference when *that* node's data is mutated, so unrelated changes
// to other nodes no longer re-render this one.
export const PromptNode = memo(PromptNodeImpl)
PromptNode.displayName = 'PromptNode'
