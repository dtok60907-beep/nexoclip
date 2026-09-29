import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLocalPresenceSnapshot,
  createPresenceController,
  getOrCreateParticipantHint,
  getPresenceColor,
  presenceSnapshotNeedsPublish,
  projectRemotePresence,
} from './presence'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class FakeClock {
  now = 1_000
  private nextTimerId = 1
  private readonly timers = new Map<number, { at: number; callback: () => void }>()

  setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, {
      at: this.now + delayMs,
      callback,
    })
    return id
  }

  clearTimeout = (timerId: number): void => {
    this.timers.delete(timerId)
  }

  advanceBy(delayMs: number): void {
    const target = this.now + delayMs

    while (true) {
      const nextTimer = Array.from(this.timers.entries()).sort((left, right) => left[1].at - right[1].at)[0]
      if (!nextTimer || nextTimer[1].at > target) {
        break
      }

      this.now = nextTimer[1].at
      this.timers.delete(nextTimer[0])
      nextTimer[1].callback()
    }

    this.now = target
  }
}

class FakeAwareness {
  localState: Record<string, unknown> | null = null
  readonly fieldWrites: Array<{ key: string; value: unknown }> = []

  getLocalState(): Record<string, unknown> | null {
    return this.localState
  }

  setLocalState(state: Record<string, unknown> | null): void {
    this.localState = state
  }

  setLocalStateField(key: string, value: unknown): void {
    this.fieldWrites.push({ key, value })
    this.localState = {
      ...(this.localState ?? {}),
      [key]: value,
    }
  }
}

test('getOrCreateParticipantHint reuses the same id for the same tab reload', () => {
  const storage = new MemoryStorage()
  let createCount = 0

  const first = getOrCreateParticipantHint(storage, {
    createId: () => `participant-${++createCount}`,
  })
  const second = getOrCreateParticipantHint(storage, {
    createId: () => `participant-${++createCount}`,
  })

  assert.equal(first, 'participant-1')
  assert.equal(second, 'participant-1')
  assert.equal(createCount, 1)
})

test('getOrCreateParticipantHint creates distinct ids for distinct tabs', () => {
  let createCount = 0

  const alpha = getOrCreateParticipantHint(new MemoryStorage(), {
    createId: () => `participant-${++createCount}`,
  })
  const beta = getOrCreateParticipantHint(new MemoryStorage(), {
    createId: () => `participant-${++createCount}`,
  })

  assert.notEqual(alpha, beta)
})

test('getPresenceColor is deterministic for the same participant and varied across participants', () => {
  const alphaFirst = getPresenceColor('participant-alpha')
  const alphaSecond = getPresenceColor('participant-alpha')
  const beta = getPresenceColor('participant-beta')

  assert.deepEqual(alphaFirst, alphaSecond)
  assert.notDeepEqual(alphaFirst, beta)
  assert.match(alphaFirst.cursor, /^hsl\(/)
  assert.match(alphaFirst.selection, /^color-mix\(/)
})

test('createLocalPresenceSnapshot derives editing from the active text editor node', () => {
  const snapshot = createLocalPresenceSnapshot(['node-1', 'node-1'], {
    tagName: 'TEXTAREA',
    closest: (selector: string) => selector === '.react-flow__node'
      ? { getAttribute: (name: string) => (name === 'data-id' ? 'node-9' : null) }
      : null,
  })

  assert.deepEqual(snapshot, {
    selection: { nodeIds: ['node-1'] },
    editing: { nodeId: 'node-9' },
  })
})

test('presenceSnapshotNeedsPublish detects recreated awareness missing selection and editing', () => {
  const snapshot = createLocalPresenceSnapshot(['node-1'], {
    tagName: 'INPUT',
    closest: (selector: string) => selector === '.react-flow__node'
      ? { getAttribute: (name: string) => (name === 'data-id' ? 'node-3' : null) }
      : null,
  })

  assert.equal(
    presenceSnapshotNeedsPublish({ participantId: 'participant-alpha' }, snapshot),
    true,
  )
  assert.equal(
    presenceSnapshotNeedsPublish(
      {
        participantId: 'participant-alpha',
        selection: { nodeIds: ['node-1'] },
        editing: { nodeId: 'node-3' },
      },
      snapshot,
    ),
    false,
  )
})

test('createPresenceController throttles cursor writes and flushes the latest point', () => {
  const awareness = new FakeAwareness()
  const clock = new FakeClock()
  const controller = createPresenceController({
    awareness,
    participantId: 'participant-alpha',
    throttleMs: 48,
    heartbeatMs: 2_000,
    now: () => clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: (timer) => clock.clearTimeout(timer as number),
  })

  controller.publishCursor({ x: 10, y: 20 })
  controller.publishCursor({ x: 30, y: 40 })
  controller.publishCursor({ x: 50, y: 60 })

  assert.deepEqual(
    awareness.fieldWrites.filter((entry) => entry.key === 'cursor'),
    [{ key: 'cursor', value: { x: 10, y: 20 } }],
  )

  clock.advanceBy(47)
  assert.equal(awareness.fieldWrites.filter((entry) => entry.key === 'cursor').length, 1)

  clock.advanceBy(1)
  assert.deepEqual(
    awareness.fieldWrites.filter((entry) => entry.key === 'cursor'),
    [
      { key: 'cursor', value: { x: 10, y: 20 } },
      { key: 'cursor', value: { x: 50, y: 60 } },
    ],
  )

  controller.destroy()
})

test('createPresenceController publishes selection, editing, and drag lock lifecycle', () => {
  const awareness = new FakeAwareness()
  const clock = new FakeClock()
  const controller = createPresenceController({
    awareness,
    participantId: 'participant-alpha',
    throttleMs: 48,
    heartbeatMs: 2_000,
    now: () => clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: (timer) => clock.clearTimeout(timer as number),
  })

  controller.publishSelection(['node-1', 'node-2'])
  controller.publishEditing('node-1')
  controller.startDragLock('node-1')
  clock.advanceBy(2_000)
  controller.stopDragLock()

  assert.deepEqual(awareness.localState?.selection, { nodeIds: ['node-1', 'node-2'] })
  assert.deepEqual(awareness.localState?.editing, { nodeId: 'node-1' })
  assert.deepEqual(
    awareness.fieldWrites.filter((entry) => entry.key === 'lock'),
    [
      // Every publish carries expiresAt = now + 3x heartbeat, so a peer
      // that disconnects mid-drag (never reaching stopDragLock) doesn't
      // leave a lock stuck in shared awareness state forever.
      { key: 'lock', value: { nodeId: 'node-1', expiresAt: 1_000 + 2_000 * 3 } },
      { key: 'lock', value: { nodeId: 'node-1', expiresAt: 3_000 + 2_000 * 3 } },
      { key: 'lock', value: null },
    ],
  )

  controller.destroy()
})

test('projectRemotePresence exposes a non-empty scene id and drops invalid values', () => {
  const peers = projectRemotePresence([
    { clientId: 1, sceneId: 'scene-2' },
    { clientId: 2, sceneId: '' },
    { clientId: 3, sceneId: '   ' },
    { clientId: 4, sceneId: 42 },
  ])

  assert.equal(peers[0]?.sceneId, 'scene-2')
  assert.equal(peers[1]?.sceneId, undefined)
  assert.equal(peers[2]?.sceneId, undefined)
  assert.equal(peers[3]?.sceneId, undefined)
})

test('projectRemotePresence drops non-finite cursor points', () => {
  const peer = projectRemotePresence([{ clientId: 1, cursor: { x: Number.NaN, y: 2 } }])[0]

  assert.equal(peer?.cursor, undefined)
})

test('createPresenceController publishes scene changes', () => {
  const awareness = new FakeAwareness()
  const controller = createPresenceController({ awareness, participantId: 'participant-alpha' })

  controller.publishScene('scene-2')

  assert.deepEqual(awareness.fieldWrites.at(-1), { key: 'sceneId', value: 'scene-2' })
  controller.destroy()
})

test('projectRemotePresence drops expired locks using server time but keeps the participant visible', () => {
  const peers = projectRemotePresence(
    [
      {
        clientId: 7,
        participantId: 'participant-alpha',
        name: 'Guest 1',
        cursor: { x: 1, y: 2 },
        selection: { nodeIds: ['node-1'] },
        editing: { nodeId: 'node-1' },
        lock: { nodeId: 'node-1', expiresAt: 1_050 },
      },
      {
        clientId: 8,
        participantId: 'participant-beta',
        name: 'Guest 2',
        lock: { nodeId: 'node-2', expiresAt: 999 },
      },
    ],
    { now: 1_000 },
  )

  assert.equal(peers.length, 2)
  assert.equal(peers[0]?.name, 'Guest 1')
  assert.equal(peers[0]?.lock?.nodeId, 'node-1')
  assert.equal(peers[1]?.name, 'Guest 2')
  assert.equal(peers[1]?.lock, undefined)
  assert.equal(peers[1]?.selection.nodeIds.length, 0)
})
