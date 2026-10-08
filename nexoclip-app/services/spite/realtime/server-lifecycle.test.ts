import assert from 'node:assert/strict'
import test from 'node:test'

import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { createCanvasDocument, readCanvasProjection, upsertNode } from '../lib/realtime/document'
import { issueRealtimeToken } from './auth'
import type { DatabaseAdapter, QueryResult } from './db'
import { ProjectRuntime, type ProjectRuntimeState } from './project-runtime'
import { createRealtimeServer } from './server'

const JWT_SECRET = 'jwt-secret'
const CANVAS_AUTH_SECRET = 'canvas-secret'
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'
const OWNER_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const LOCK_TTL_MS = 5_000

function roomName(projectId = PROJECT_ID) {
  return `project:${projectId}`
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type LoadedProjectDocument = {
  doc: Y.Doc
  snapshotSeq: number
  durableSeq: number
  projectedSeq: number
}

type StatelessMessage =
  | { type: 'STATUS'; status: ProjectRuntimeState; projectId: string }
  | { type: 'ACK'; status: 'PERSISTED'; projectId: string; seq: number }

type ProviderClient = {
  provider: HocuspocusProvider
  document: Y.Doc
  synced: Promise<void>
  outcome: Promise<'authenticated' | 'authenticationFailed' | 'closed'>
  statelessMessages: StatelessMessage[]
}

class FakeClock {
  now = 0

  private nextTimerId = 1
  private readonly timers = new Map<
    number,
    {
      id: number
      dueAt: number
      callback: () => void | Promise<void>
    }
  >()

  setTimeout = (callback: () => void | Promise<void>, delayMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, {
      id,
      dueAt: this.now + Math.max(0, delayMs),
      callback,
    })
    return id
  }

  clearTimeout = (timerId: ReturnType<typeof setTimeout> | number | null | undefined): void => {
    if (typeof timerId === 'number') {
      this.timers.delete(timerId)
    }
  }

  async advanceBy(delayMs: number): Promise<void> {
    const target = this.now + Math.max(0, delayMs)

    while (true) {
      const next = this.nextDueTimer(target)
      if (!next) break

      this.now = next.dueAt
      this.timers.delete(next.id)
      await next.callback()
      await flushMicrotasks()
    }

    this.now = target
    await flushMicrotasks()
  }

  private nextDueTimer(target: number) {
    let winner: { id: number; dueAt: number; callback: () => void | Promise<void> } | null = null

    for (const timer of this.timers.values()) {
      if (timer.dueAt > target) continue
      if (!winner || timer.dueAt < winner.dueAt || (timer.dueAt === winner.dueAt && timer.id < winner.id)) {
        winner = timer
      }
    }

    return winner
  }
}

class FakeRealtimeRepository {
  readonly owners = new Map<string, Set<string>>()
  readonly docs = new Map<string, LoadedProjectDocument>()
  readonly loadCalls: string[] = []
  readonly appendCalls: Array<{ projectId: string; update: Uint8Array }> = []
  readonly compactCalls: Array<{ projectId: string; includedSeq: number }> = []

  appendBehavior: (projectId: string, update: Uint8Array) => Promise<number> = async () => 1
  compactBehavior: (projectId: string, snapshot: Uint8Array, includedSeq: number) => Promise<void> = async () => {}

  setOwner(projectId: string, userId: string): void {
    const owners = this.owners.get(projectId) ?? new Set<string>()
    owners.add(userId)
    this.owners.set(projectId, owners)
  }

  setDocument(projectId: string, doc: Y.Doc): void {
    this.docs.set(projectId, {
      doc,
      snapshotSeq: 0,
      durableSeq: 0,
      projectedSeq: 0,
    })
  }

  async ownsProject(projectId: string, userId: string): Promise<boolean> {
    return this.owners.get(projectId)?.has(userId) ?? false
  }

  async loadOrImport(projectId: string): Promise<LoadedProjectDocument> {
    this.loadCalls.push(projectId)
    const loaded = this.docs.get(projectId)
    assert.ok(loaded, `expected preloaded document for ${projectId}`)
    return loaded
  }

  async appendUpdate(projectId: string, update: Uint8Array): Promise<number> {
    this.appendCalls.push({
      projectId,
      update: new Uint8Array(update),
    })
    return this.appendBehavior(projectId, update)
  }

  async compact(projectId: string, snapshot: Uint8Array, includedSeq: number): Promise<void> {
    this.compactCalls.push({ projectId, includedSeq })
    await this.compactBehavior(projectId, snapshot, includedSeq)
  }

  async close(): Promise<void> {}
}

class FakeAuthorizationDatabase implements DatabaseAdapter {
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> {
    throw new Error('query should not be called directly in realtime lifecycle tests')
  }

  async transaction<T>(
    work: (client: {
      query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params?: readonly unknown[],
      ): Promise<QueryResult<Row>>
    }) => Promise<T>,
  ): Promise<T> {
    return work({
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> => {
        throw new Error('authorization transaction queries are not expected in realtime lifecycle tests')
      },
    })
  }

  async close(): Promise<void> {}
}

class StaticReadOnlyRuntime {
  readonly enqueueCalls: Uint8Array[] = []

  canAcceptMutation(): boolean {
    return false
  }

  async enqueue(update: Uint8Array): Promise<number> {
    this.enqueueCalls.push(new Uint8Array(update))
    return 1
  }

  async flush(): Promise<void> {}
  async compact(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function parseStatelessMessage(payload: string): StatelessMessage | null {
  try {
    const parsed = JSON.parse(payload) as StatelessMessage
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function connectProvider({
  url,
  name,
  token,
  document = new Y.Doc(),
}: {
  url: string
  name: string
  token: string
  document?: Y.Doc
}): Promise<ProviderClient> {
  let syncedResolve!: () => void
  let outcomeResolve!: (value: 'authenticated' | 'authenticationFailed' | 'closed') => void
  let outcomeReject!: (error: unknown) => void
  const synced = new Promise<void>((resolve) => {
    syncedResolve = resolve
  })
  const outcome = new Promise<'authenticated' | 'authenticationFailed' | 'closed'>((resolve, reject) => {
    outcomeResolve = resolve
    outcomeReject = reject
  })
  const statelessMessages: StatelessMessage[] = []

  let settled = false
  const settleOutcome = (value: 'authenticated' | 'authenticationFailed' | 'closed') => {
    if (settled) return
    settled = true
    outcomeResolve(value)
  }

  const provider = new HocuspocusProvider({
    url,
    name,
    document,
    token,
    autoConnect: false,
    forceSyncInterval: false,
    preserveTrailingSlash: false,
    timeout: 1_000,
    delay: 10,
    initialDelay: 0,
    minDelay: 0,
    factor: 1,
    maxAttempts: 1,
    jitter: false,
    messageReconnectTimeout: 2_000,
    onAuthenticated() {
      settleOutcome('authenticated')
    },
    onAuthenticationFailed() {
      settleOutcome('authenticationFailed')
    },
    onClose() {
      settleOutcome('closed')
    },
    onSynced({ state }: { state: boolean }) {
      if (state) {
        syncedResolve()
      }
    },
    onStateless({ payload }: { payload: string }) {
      const parsed = parseStatelessMessage(payload)
      if (parsed) {
        statelessMessages.push(parsed)
      }
    },
  } as any)

  void provider.connect().catch((error) => {
    if (settled) return
    settled = true
    outcomeReject(error)
  })

  return {
    provider,
    document,
    synced,
    outcome,
    statelessMessages,
  }
}

function findParticipantState(provider: HocuspocusProvider, participantId: string) {
  return Array.from(provider.awareness?.getStates().values() ?? []).find(
    (state) => state && typeof state === 'object' && state.participantId === participantId,
  ) as Record<string, any> | undefined
}

function findParticipantStates(provider: HocuspocusProvider, participantId: string) {
  return Array.from(provider.awareness?.getStates().values() ?? []).filter(
    (state) => state && typeof state === 'object' && state.participantId === participantId,
  ) as Array<Record<string, any>>
}

function setAwarenessState(
  client: ProviderClient,
  state: Record<string, unknown>,
): void {
  client.provider.awareness?.setLocalState(state)
}

function createRealtimeRuntime(options: {
  projectId: string
  doc: Y.Doc
  repository: FakeRealtimeRepository
  onStateChange?: (state: ProjectRuntimeState) => void
}) {
  return new ProjectRuntime({
    projectId: options.projectId,
    doc: options.doc,
    repository: options.repository,
    onStateChange: options.onStateChange,
    config: {
      batchWindowMs: 0,
      retryBaseMs: 10,
      retryMaxMs: 10,
      retryJitterRatio: 0,
      projectionDebounceMs: 0,
      projectionRetryBaseMs: 10,
      projectionRetryMaxMs: 10,
      snapshotIdleMs: 0,
      snapshotIntervalMs: 0,
      compactAfterUpdates: 10_000,
      compactAfterBytes: 10_000_000,
      maxQueuedUpdates: 64,
      maxQueuedBytes: 1_000_000,
    },
    projectDocument: async () => {},
  })
}

test('awareness sanitizes trusted user data, allocates room-scoped Guest N labels, reuses released names, and expires locks from server time', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const clock = new FakeClock()
  clock.now = 1_000

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    clock,
    awarenessLockTtlMs: LOCK_TTL_MS,
    createRuntime: ({ doc }) => new StaticReadOnlyRuntime(),
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const alpha = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const beta = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await Promise.all([alpha.synced, beta.synced])

    setAwarenessState(alpha, {
      participantId: 'alpha',
      userId: 'forged-user',
      name: 'Mallory',
      cursor: { x: 1, y: 2 },
      lock: {
        nodeId: 'node-1',
        expiresAt: 999_999_999,
      },
    })
    setAwarenessState(beta, {
      participantId: 'beta',
      userId: 'another-forgery',
      name: 'Eve',
      cursor: { x: 3, y: 4 },
    })

    await waitFor(() => !!findParticipantState(alpha.provider, 'beta'))
    await waitFor(() => !!findParticipantState(beta.provider, 'alpha'))

    const alphaOnBeta = findParticipantState(beta.provider, 'alpha')
    const betaOnAlpha = findParticipantState(alpha.provider, 'beta')

    assert.ok(alphaOnBeta)
    assert.ok(betaOnAlpha)
    assert.equal(alphaOnBeta.userId, OWNER_USER_ID)
    assert.equal(alphaOnBeta.name, 'Guest 1')
    assert.equal(alphaOnBeta.lock.nodeId, 'node-1')
    assert.equal(alphaOnBeta.lock.expiresAt, clock.now + LOCK_TTL_MS)
    assert.equal(betaOnAlpha.userId, OWNER_USER_ID)
    assert.equal(betaOnAlpha.name, 'Guest 2')

    alpha.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 1)

    const gamma = await connectProvider({ url: server.wsUrl, name: roomName(), token })
    try {
      await gamma.synced
      setAwarenessState(gamma, {
        participantId: 'gamma',
        userId: 'forged-third-user',
        name: 'Oscar',
        lock: {
          nodeId: 'node-3',
          expiresAt: -1,
        },
      })

      await waitFor(() => !!findParticipantState(beta.provider, 'gamma'))
      const gammaOnBeta = findParticipantState(beta.provider, 'gamma')
      assert.ok(gammaOnBeta)
      assert.equal(gammaOnBeta.userId, OWNER_USER_ID)
      assert.equal(gammaOnBeta.name, 'Guest 1')
      assert.equal(gammaOnBeta.lock.expiresAt, clock.now + LOCK_TTL_MS)

      await clock.advanceBy(LOCK_TTL_MS - 1)
      assert.equal(findParticipantState(beta.provider, 'gamma')?.lock?.nodeId, 'node-3')

      await clock.advanceBy(1)
      await waitFor(() => !findParticipantState(beta.provider, 'gamma')?.lock)
    } finally {
      gamma.provider.destroy()
    }
  } finally {
    beta.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('two sockets forging the same participantId get distinct Guests, independent lock expiry, and isolated cleanup', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const clock = new FakeClock()
  clock.now = 1_000

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    clock,
    awarenessLockTtlMs: LOCK_TTL_MS,
    createRuntime: ({ doc }) => new StaticReadOnlyRuntime(),
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const alpha = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const beta = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const observer = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await Promise.all([alpha.synced, beta.synced, observer.synced])

    setAwarenessState(alpha, {
      participantId: 'shared-participant',
      userId: 'forged-alpha',
      name: 'Mallory',
      lock: {
        nodeId: 'node-alpha',
      },
    })

    await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 1)
    clock.now += 1_000

    setAwarenessState(beta, {
      participantId: 'shared-participant',
      userId: 'forged-beta',
      name: 'Eve',
      lock: {
        nodeId: 'node-beta',
      },
    })

    await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 2)

    const initialStatesByName = new Map(
      findParticipantStates(observer.provider, 'shared-participant').map((state) => [state.name, state]),
    )

    assert.deepEqual([...initialStatesByName.keys()].sort(), ['Guest 1', 'Guest 2'])
    assert.equal(initialStatesByName.get('Guest 1')?.userId, OWNER_USER_ID)
    assert.equal(initialStatesByName.get('Guest 1')?.lock?.nodeId, 'node-alpha')
    assert.equal(initialStatesByName.get('Guest 1')?.lock?.expiresAt, 6_000)
    assert.equal(initialStatesByName.get('Guest 2')?.userId, OWNER_USER_ID)
    assert.equal(initialStatesByName.get('Guest 2')?.lock?.nodeId, 'node-beta')
    assert.equal(initialStatesByName.get('Guest 2')?.lock?.expiresAt, 7_000)

    await clock.advanceBy(LOCK_TTL_MS - 1_000)
    await waitFor(() => {
      const statesByName = new Map(
        findParticipantStates(observer.provider, 'shared-participant').map((state) => [state.name, state]),
      )
      return statesByName.get('Guest 1')?.lock?.nodeId === undefined && statesByName.get('Guest 2')?.lock?.nodeId === 'node-beta'
    })

    beta.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 2)
    await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 1)
    assert.equal(findParticipantStates(observer.provider, 'shared-participant')[0]?.name, 'Guest 1')

    const delta = await connectProvider({ url: server.wsUrl, name: roomName(), token })
    try {
      await delta.synced
      setAwarenessState(delta, {
        participantId: 'shared-participant',
        userId: 'forged-delta',
        name: 'Oscar',
      })

      await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 2)
      assert.deepEqual(
        findParticipantStates(observer.provider, 'shared-participant')
          .map((state) => state.name)
          .sort(),
        ['Guest 1', 'Guest 2'],
      )
    } finally {
      delta.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 2)
    }
  } finally {
    alpha.provider.destroy()
    observer.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('read-only rooms still admit awareness but reject document mutations before application', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const runtime = new StaticReadOnlyRuntime()
  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: () => runtime,
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const first = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const second = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await Promise.all([first.synced, second.synced])

    assert.equal(second.provider.authorizedScope, 'readonly')
    await waitFor(
      () => second.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'),
    )

    setAwarenessState(second, {
      participantId: 'beta',
      userId: 'forged',
      name: 'forged',
      cursor: { x: 33, y: 44 },
    })

    await waitFor(() => !!findParticipantState(first.provider, 'beta'))
    assert.equal(findParticipantState(first.provider, 'beta')?.name, 'Guest 1')

    upsertNode(second.document, {
      id: 'blocked-node',
      type: 'prompt',
      position: { x: 9, y: 9 },
      data: { label: 'blocked' },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(runtime.enqueueCalls.length, 0)
    assert.equal(readCanvasProjection(first.document).nodes.some((node) => node.id === 'blocked-node'), false)

    setAwarenessState(second, {
      participantId: 'beta',
      userId: 'forged',
      name: 'forged',
      cursor: { x: 55, y: 66 },
    })

    await waitFor(() => findParticipantState(first.provider, 'beta')?.cursor?.x === 55)
  } finally {
    first.provider.destroy()
    second.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('durable ACKs follow Yjs update -> enqueue -> Neon commit -> PERSISTED -> ACK with no premature ACK', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const appendDeferred = deferred<number>()
  const orderedFacts: string[] = []
  repository.appendBehavior = async () => {
    const seq = await appendDeferred.promise
    orderedFacts.push('NEON_COMMIT')
    return seq
  }

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: ({ projectId, doc, repository: runtimeRepository, onStateChange }) =>
      createRealtimeRuntime({ projectId, doc, repository: runtimeRepository as FakeRealtimeRepository, onStateChange }),
    onEvent: (event) => {
      if (event.type === 'ws:enqueue') {
        orderedFacts.push('ENQUEUE')
      }
    },
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const client = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await client.synced

    client.document.on('update', () => {
      if (!orderedFacts.includes('YJS_UPDATE')) {
        orderedFacts.unshift('YJS_UPDATE')
      }
    })

    upsertNode(client.document, {
      id: 'node-1',
      type: 'prompt',
      position: { x: 10, y: 20 },
      data: { label: 'durable' },
    })

    await waitFor(() => repository.appendCalls.length === 1)
    assert.deepEqual(
      client.statelessMessages.filter((message) => message.type === 'ACK' || (message.type === 'STATUS' && message.status === 'PERSISTED')),
      [],
    )

    appendDeferred.resolve(7)

    await waitFor(
      () => client.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 7),
    )

    for (const message of client.statelessMessages) {
      if (message.type === 'STATUS' && message.status === 'PERSISTED') {
        orderedFacts.push('PERSISTED')
      }
      if (message.type === 'ACK') {
        orderedFacts.push('ACK')
      }
    }

    assert.deepEqual(
      orderedFacts.filter((fact) => ['YJS_UPDATE', 'ENQUEUE', 'NEON_COMMIT', 'PERSISTED', 'ACK'].includes(fact)),
      ['YJS_UPDATE', 'ENQUEUE', 'NEON_COMMIT', 'PERSISTED', 'ACK'],
    )
  } finally {
    client.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('failed appends emit no PERSISTED status or ACK until a retry commits successfully', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const retryCommit = deferred<number>()
  let appendAttempt = 0
  repository.appendBehavior = async () => {
    appendAttempt += 1
    if (appendAttempt === 1) {
      throw new Error('neon append failed once')
    }
    return retryCommit.promise
  }

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: ({ projectId, doc, repository: runtimeRepository, onStateChange }) =>
      createRealtimeRuntime({ projectId, doc, repository: runtimeRepository as FakeRealtimeRepository, onStateChange }),
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const client = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await client.synced

    upsertNode(client.document, {
      id: 'retry-node',
      type: 'prompt',
      position: { x: 11, y: 22 },
      data: { label: 'retry' },
    })

    await waitFor(() => client.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'DEGRADED'))
    assert.equal(client.statelessMessages.some((message) => message.type === 'ACK'), false)
    assert.equal(
      client.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'PERSISTED'),
      false,
    )

    await waitFor(() => appendAttempt >= 2)
    assert.equal(client.statelessMessages.some((message) => message.type === 'ACK'), false)

    retryCommit.resolve(9)
    await waitFor(() => client.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 9))
  } finally {
    client.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('graceful shutdown flushes pending writes before close without sending a premature ACK', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.setDocument(PROJECT_ID, createCanvasDocument())

  const appendDeferred = deferred<number>()
  repository.appendBehavior = async () => appendDeferred.promise

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: ({ projectId, doc, repository: runtimeRepository, onStateChange }) =>
      createRealtimeRuntime({ projectId, doc, repository: runtimeRepository as FakeRealtimeRepository, onStateChange }),
  })

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  await server.listen()

  const client = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await client.synced

    upsertNode(client.document, {
      id: 'shutdown-node',
      type: 'prompt',
      position: { x: 12, y: 24 },
      data: { label: 'shutdown' },
    })

    await waitFor(() => repository.appendCalls.length === 1)
    const shutdownPromise = server.destroy()

    await waitFor(
      () => client.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'),
    )
    assert.equal(client.statelessMessages.some((message) => message.type === 'ACK'), false)

    appendDeferred.resolve(13)
    await shutdownPromise

    assert.equal(client.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 13), true)
    assert.equal(repository.compactCalls.some((call) => call.includedSeq === 13), true)
  } finally {
    client.provider.destroy()
  }
})
