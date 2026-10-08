import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Pool } from '@neondatabase/serverless'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import {
  CURRENT_SCHEMA_VERSION,
  createCanvasDocument,
  deleteNode,
  patchNode,
  readCanvasProjection,
  upsertNode,
  type CanvasProjection,
} from '../lib/realtime/document'
import { applyRealtimeSchema } from '../scripts/migrate-realtime.mjs'
import { issueRealtimeToken } from './auth'
import { createDatabaseAdapter, type DatabaseAdapter, type QueryResult } from './db'
import { projectDocument as persistProjection } from './projector'
import { ProjectRuntime, type ProjectRuntimeState } from './project-runtime'
import { createRealtimeServer } from './server'
import { YjsRepository } from './yjs-repository'

const JWT_SECRET = 'jwt-secret'
const CANVAS_AUTH_SECRET = 'canvas-secret'
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'
const OWNER_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const databaseUrl = process.env.SPITE_TEST_DATABASE_URL
const integrationSkip = databaseUrl ? undefined : 'SPITE_TEST_DATABASE_URL is not set'

type LoadedProjectDocument = {
  doc: Y.Doc
  snapshotSeq: number
  durableSeq: number
  projectedSeq: number
}

type ProjectionWrite = {
  projectId: string
  targetSeq: number
  projection: CanvasProjection
}

type LagEntry = {
  projectId: string
  durableSeq: number
  projectedSeq: number
  lag: number
}

type ProviderClient = {
  provider: HocuspocusProvider
  document: Y.Doc
  synced: Promise<void>
  outcome: Promise<'authenticated' | 'authenticationFailed' | 'closed'>
  statelessMessages: Array<
    | { type: 'STATUS'; status: ProjectRuntimeState; projectId: string }
    | { type: 'ACK'; status: 'PERSISTED'; projectId: string; seq: number }
  >
  getSyncCount(): number
}

type DatabaseIntegrationContext = {
  pool: Pool
  database: DatabaseAdapter
  repository: YjsRepository
  projectIds: string[]
}

type ProjectState = {
  snapshot: Uint8Array | null
  snapshotSeq: number
  durableSeq: number
  projectedSeq: number
  updates: Array<{ seq: number; update: Uint8Array }>
  projection: CanvasProjection
}

class InMemoryRealtimeRepository {
  readonly owners = new Map<string, Set<string>>()
  readonly projects = new Map<string, ProjectState>()
  readonly projectionWrites: ProjectionWrite[] = []
  readonly appendCalls: Array<{ projectId: string; update: Uint8Array }> = []
  readonly loadCalls: string[] = []

  appendFailuresRemaining = 0
  projectionFailuresRemaining = 0

  setOwner(projectId: string, userId: string): void {
    const owners = this.owners.get(projectId) ?? new Set<string>()
    owners.add(userId)
    this.owners.set(projectId, owners)
  }

  seedProject(projectId: string, doc: Y.Doc): void {
    this.projects.set(projectId, {
      snapshot: Y.encodeStateAsUpdate(doc),
      snapshotSeq: 0,
      durableSeq: 0,
      projectedSeq: 0,
      updates: [],
      projection: structuredClone(readCanvasProjection(doc)),
    })
  }

  async ownsProject(projectId: string, userId: string): Promise<boolean> {
    return this.owners.get(projectId)?.has(userId) ?? false
  }

  async loadOrImport(projectId: string): Promise<LoadedProjectDocument> {
    this.loadCalls.push(projectId)
    const state = this.requireProject(projectId)
    return {
      doc: this.rebuildDocument(projectId),
      snapshotSeq: state.snapshotSeq,
      durableSeq: state.durableSeq,
      projectedSeq: state.projectedSeq,
    }
  }

  async appendUpdate(projectId: string, update: Uint8Array): Promise<number> {
    this.appendCalls.push({ projectId, update: new Uint8Array(update) })
    if (this.appendFailuresRemaining > 0) {
      this.appendFailuresRemaining -= 1
      throw new Error('simulated persistence outage')
    }

    const state = this.requireProject(projectId)
    const seq = state.durableSeq + 1
    state.durableSeq = seq
    state.updates.push({ seq, update: new Uint8Array(update) })
    return seq
  }

  async compact(projectId: string, snapshot: Uint8Array, includedSeq: number): Promise<void> {
    const state = this.requireProject(projectId)
    state.snapshot = new Uint8Array(snapshot)
    state.snapshotSeq = includedSeq
    state.updates = state.updates.filter((entry) => entry.seq > includedSeq)
  }

  async projectDocument(projectId: string, projection: CanvasProjection, targetSeq: number): Promise<void> {
    if (this.projectionFailuresRemaining > 0) {
      this.projectionFailuresRemaining -= 1
      throw new Error('simulated projection outage')
    }

    const state = this.requireProject(projectId)
    state.projection = structuredClone(projection)
    state.projectedSeq = targetSeq
    this.projectionWrites.push({ projectId, targetSeq, projection: structuredClone(projection) })
  }

  async loadProjectionLag(): Promise<LagEntry[]> {
    return [...this.projects.entries()]
      .map(([projectId, state]) => ({
        projectId,
        durableSeq: state.durableSeq,
        projectedSeq: state.projectedSeq,
        lag: state.durableSeq - state.projectedSeq,
      }))
      .filter((entry) => entry.projectedSeq < entry.durableSeq)
      .sort((a, b) => b.lag - a.lag || a.projectId.localeCompare(b.projectId))
  }

  async close(): Promise<void> {}

  snapshotAt(projectId: string, includedSeq: number): void {
    const state = this.requireProject(projectId)
    const snapshotDoc = this.rebuildDocument(projectId, includedSeq)
    state.snapshot = Y.encodeStateAsUpdate(snapshotDoc)
    state.snapshotSeq = includedSeq
    state.updates = state.updates.filter((entry) => entry.seq > includedSeq)
  }

  getProjectedSeq(projectId: string): number {
    return this.requireProject(projectId).projectedSeq
  }

  getDurableSeq(projectId: string): number {
    return this.requireProject(projectId).durableSeq
  }

  private requireProject(projectId: string): ProjectState {
    const state = this.projects.get(projectId)
    assert.ok(state, `expected in-memory project ${projectId}`)
    return state
  }

  private rebuildDocument(projectId: string, stopAtSeq = Number.POSITIVE_INFINITY): Y.Doc {
    const state = this.requireProject(projectId)
    const doc = new Y.Doc()
    if (state.snapshot) {
      Y.applyUpdate(doc, state.snapshot)
    }
    for (const entry of state.updates) {
      if (entry.seq > stopAtSeq) break
      Y.applyUpdate(doc, entry.update)
    }
    return doc
  }
}

class FakeAuthorizationDatabase implements DatabaseAdapter {
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> {
    throw new Error('query is not used in collaboration integration tests')
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
        throw new Error('transaction query is not used in collaboration integration tests')
      },
    })
  }

  async close(): Promise<void> {}
}

function roomName(projectId = PROJECT_ID) {
  return `project:${projectId}`
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForAsync(predicate: () => Promise<boolean>, timeoutMs = 2_500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function parseStatelessMessage(payload: string) {
  try {
    return JSON.parse(payload) as ProviderClient['statelessMessages'][number]
  } catch {
    return null
  }
}

async function connectProvider({
  url,
  name,
  token,
  document = new Y.Doc(),
  maxAttempts = 1,
}: {
  url: string
  name: string
  token: string | (() => Promise<string>)
  document?: Y.Doc
  maxAttempts?: number
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
  const statelessMessages: ProviderClient['statelessMessages'] = []
  let syncCount = 0

  let settled = false
  const settle = (value: 'authenticated' | 'authenticationFailed' | 'closed') => {
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
    maxAttempts,
    jitter: false,
    messageReconnectTimeout: 2_000,
    onAuthenticated() {
      settle('authenticated')
    },
    onAuthenticationFailed() {
      settle('authenticationFailed')
    },
    onClose() {
      settle('closed')
    },
    onSynced({ state }: { state: boolean }) {
      if (!state) return
      syncCount += 1
      syncedResolve()
    },
    onStateless({ payload }: { payload: string }) {
      const parsed = parseStatelessMessage(payload)
      if (parsed) statelessMessages.push(parsed)
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
    getSyncCount: () => syncCount,
  }
}

function findNode(doc: Y.Doc, nodeId: string) {
  return readCanvasProjection(doc).nodes.find((node) => node.id === nodeId)
}

function findParticipantStates(provider: HocuspocusProvider, participantId: string) {
  return Array.from(provider.awareness?.getStates().values() ?? []).filter(
    (state) => state && typeof state === 'object' && state.participantId === participantId,
  ) as Array<Record<string, any>>
}

function setAwarenessState(client: ProviderClient, state: Record<string, unknown>): void {
  client.provider.awareness?.setLocalState(state)
}

function forceCloseProviderSocket(provider: HocuspocusProvider): boolean {
  const websocketProvider = (provider as any).configuration?.websocketProvider
  const candidates = [
    websocketProvider?.webSocket,
    websocketProvider?.websocket,
    (provider as any).webSocket,
    (provider as any).websocket,
    (provider as any).websocketProvider?.webSocket,
    (provider as any).websocketProvider?.websocket,
  ]

  for (const socket of candidates) {
    if (!socket) continue
    if (typeof socket.terminate === 'function') {
      socket.terminate()
      return true
    }
    if (typeof socket.close === 'function') {
      socket.close()
      return true
    }
  }

  return false
}

function createRuntimeFactory(repository: InMemoryRealtimeRepository, overrides: Partial<ConstructorParameters<typeof ProjectRuntime>[0]['config']> = {}) {
  return ({ projectId, doc, onStateChange }: { projectId: string; doc: Y.Doc; onStateChange?: (state: ProjectRuntimeState) => void }) =>
    new ProjectRuntime({
      projectId,
      doc,
      repository,
      projectDocument: async (targetProjectId, projection, targetSeq) => {
        await repository.projectDocument(targetProjectId, projection, targetSeq)
      },
      onStateChange,
      random: () => 0,
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
        ...overrides,
      },
    })
}

function createDatabaseRuntimeFactory(
  repository: YjsRepository,
  database: DatabaseAdapter,
  overrides: Partial<ConstructorParameters<typeof ProjectRuntime>[0]['config']> = {},
) {
  return ({ projectId, doc, onStateChange }: { projectId: string; doc: Y.Doc; onStateChange?: (state: ProjectRuntimeState) => void }) =>
    new ProjectRuntime({
      projectId,
      doc,
      repository,
      projectDocument: async (targetProjectId, projection, targetSeq) => {
        await persistProjection(targetProjectId, projection, targetSeq, { database })
      },
      onStateChange,
      random: () => 0,
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
        ...overrides,
      },
    })
}

function databaseIntegrationTest(
  name: string,
  fn: (context: DatabaseIntegrationContext) => Promise<void>,
): void {
  test(name, { skip: integrationSkip }, async () => {
    assert.ok(databaseUrl)
    await applyRealtimeSchema({ databaseUrl })

    const pool = new Pool({ connectionString: databaseUrl })
    const database = createDatabaseAdapter({ pool, ownsPool: false })
    const repository = new YjsRepository({ database })
    const projectIds: string[] = []

    try {
      await fn({ pool, database, repository, projectIds })
    } finally {
      for (const projectId of projectIds.reverse()) {
        await pool.query('DELETE FROM projects WHERE id = $1', [projectId])
      }
      await pool.end()
    }
  })
}

test('real realtime collaboration converges across more than three clients for existing-node moves, same-field winner, and delete/edit races; then survives in-memory restart', async () => {
  const repository = new InMemoryRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seeded = createCanvasDocument()
  upsertNode(seeded, {
    id: 'move-node-a',
    type: 'prompt',
    position: { x: 1, y: 2 },
    data: { label: 'A' },
  })
  upsertNode(seeded, {
    id: 'move-node-b',
    type: 'prompt',
    position: { x: 3, y: 4 },
    data: { label: 'B' },
  })
  upsertNode(seeded, {
    id: 'shared-node',
    type: 'prompt',
    position: { x: 10, y: 20 },
    data: { label: 'seed' },
  })
  upsertNode(seeded, {
    id: 'race-node',
    type: 'prompt',
    position: { x: 20, y: 30 },
    data: { label: 'before' },
  })
  repository.seedProject(PROJECT_ID, seeded)

  const createServer = (port = 0) => createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: createRuntimeFactory(repository),
  })

  let server = createServer()
  await server.listen()
  const restartPort = Number(new URL(server.wsUrl).port)
  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const clients = await Promise.all([
    connectProvider({ url: server.wsUrl, name: roomName(), token }),
    connectProvider({ url: server.wsUrl, name: roomName(), token }),
    connectProvider({ url: server.wsUrl, name: roomName(), token }),
    connectProvider({ url: server.wsUrl, name: roomName(), token }),
    connectProvider({ url: server.wsUrl, name: roomName(), token }),
  ])

  try {
    await Promise.all(clients.map((client) => client.synced))
    assert.equal(server.getConnectionCount(), 5)

    patchNode(clients[0].document, 'move-node-a', { positionX: 101, positionY: 201 })
    patchNode(clients[1].document, 'move-node-b', { positionX: 202, positionY: 303 })

    await waitFor(() => {
      return clients.every((client) => {
        const a = findNode(client.document, 'move-node-a')
        const b = findNode(client.document, 'move-node-b')
        return a?.position.x === 101 && a.position.y === 201 && b?.position.x === 202 && b.position.y === 303
      })
    })

    patchNode(clients[2].document, 'shared-node', { type: 'image' })
    patchNode(clients[3].document, 'shared-node', { type: 'video' })

    await waitFor(() => {
      const types = clients.map((client) => findNode(client.document, 'shared-node')?.type)
      return types.every((type) => type === types[0] && (type === 'image' || type === 'video'))
    })
    const sharedWinner = findNode(clients[0].document, 'shared-node')?.type

    deleteNode(clients[1].document, 'race-node')
    patchNode(clients[4].document, 'race-node', { data: { label: 'after' } })

    await waitFor(() => clients.every((client) => !findNode(client.document, 'race-node')))

    for (const client of clients) {
      client.provider.destroy()
    }
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()

    server = createServer(restartPort)
    await server.listen()

    const restarted = await connectProvider({ url: server.wsUrl, name: roomName(), token })
    try {
      await restarted.synced
      const restartedProjection = readCanvasProjection(restarted.document)
      assert.equal(findNode(restarted.document, 'move-node-a')?.position.x, 101)
      assert.equal(findNode(restarted.document, 'move-node-a')?.position.y, 201)
      assert.equal(findNode(restarted.document, 'move-node-b')?.position.x, 202)
      assert.equal(findNode(restarted.document, 'move-node-b')?.position.y, 303)
      assert.equal(findNode(restarted.document, 'shared-node')?.type, sharedWinner)
      assert.equal(restartedProjection.nodes.some((node) => node.id === 'race-node'), false)
    } finally {
      restarted.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 0)
    }
  } finally {
    for (const client of clients) {
      client.provider.destroy()
    }
    await server.destroy()
  }
})

test('same-user sockets get separate participant identities and disconnect cleanup removes presence', async () => {
  const repository = new InMemoryRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.seedProject(PROJECT_ID, createCanvasDocument())

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
    createRuntime: createRuntimeFactory(repository),
  })

  await server.listen()
  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const alpha = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const beta = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  const observer = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await Promise.all([alpha.synced, beta.synced, observer.synced])

    setAwarenessState(alpha, {
      participantId: 'shared-participant',
      userId: 'forged-alpha',
      name: 'Mallory',
      cursor: { x: 1, y: 2 },
    })
    setAwarenessState(beta, {
      participantId: 'shared-participant',
      userId: 'forged-beta',
      name: 'Eve',
      cursor: { x: 3, y: 4 },
    })

    await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 2)
    const participantStates = findParticipantStates(observer.provider, 'shared-participant')
    const names = participantStates.map((state) => state.name).sort()
    const survivingAlpha = participantStates.find(
      (state) => state.cursor?.x === 1 && state.cursor?.y === 2,
    )

    assert.deepEqual(names, ['Guest 1', 'Guest 2'])
    assert.equal(participantStates.every((state) => state.userId === OWNER_USER_ID), true)
    assert.ok(survivingAlpha)

    beta.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 2)
    await waitFor(() => findParticipantStates(observer.provider, 'shared-participant').length === 1)

    const remainingState = findParticipantStates(observer.provider, 'shared-participant')[0]
    assert.equal(remainingState?.name, survivingAlpha.name)
    assert.deepEqual(remainingState?.cursor, { x: 1, y: 2 })
    assert.equal(remainingState?.userId, OWNER_USER_ID)
  } finally {
    alpha.provider.destroy()
    observer.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('same provider reconnects after forced socket/server closes, reruns async JWT callback, and resumes sync', async () => {
  const repository = new InMemoryRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.seedProject(PROJECT_ID, createCanvasDocument())

  const createServer = (port = 0) => createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: createRuntimeFactory(repository),
  })

  let server = createServer()
  await server.listen()
  const restartPort = Number(new URL(server.wsUrl).port)

  let tokenCalls = 0
  const token = async () => {
    tokenCalls += 1
    return (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  }

  const client = await connectProvider({
    url: server.wsUrl,
    name: roomName(),
    token,
    maxAttempts: 200,
  })

  try {
    await client.synced
    await waitFor(() => tokenCalls === 1)

    const socketClosed = forceCloseProviderSocket(client.provider)
    assert.equal(socketClosed, true)
    await waitFor(() => tokenCalls >= 2)
    await waitFor(() => client.getSyncCount() >= 2)
    await waitFor(() => server.getConnectionCount() === 1)

    await server.destroy()

    server = createServer(restartPort)
    await server.listen()

    await waitFor(() => tokenCalls >= 3)
    await waitFor(() => server.getConnectionCount() === 1)
    await waitFor(() => client.getSyncCount() >= 3)

    upsertNode(client.document, {
      id: 'reconnected-node',
      type: 'prompt',
      position: { x: 77, y: 88 },
      data: { label: 'reconnected' },
    })

    await waitFor(() => repository.getDurableSeq(PROJECT_ID) >= 1)

    const verifier = await connectProvider({
      url: server.wsUrl,
      name: roomName(),
      token: (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token,
    })
    try {
      await verifier.synced
      await waitFor(() => !!findNode(verifier.document, 'reconnected-node'))
    } finally {
      verifier.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 1)
    }
  } finally {
    client.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('hard restart rehydrates from snapshot plus updates and catches projection lag up to durable seq', async () => {
  const repository = new InMemoryRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.seedProject(PROJECT_ID, createCanvasDocument())

  const createServer = () => createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: createRuntimeFactory(repository),
  })

  let server = createServer()
  await server.listen()
  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const first = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await first.synced

    upsertNode(first.document, {
      id: 'snapshotted-node',
      type: 'prompt',
      position: { x: 10, y: 10 },
      data: { label: 'snapshot' },
    })
    await waitFor(() => repository.getDurableSeq(PROJECT_ID) === 1)
    repository.snapshotAt(PROJECT_ID, 1)

    upsertNode(first.document, {
      id: 'tail-node',
      type: 'image',
      position: { x: 20, y: 20 },
      data: { label: 'tail' },
    })
    await waitFor(() => repository.getDurableSeq(PROJECT_ID) === 2)
    repository.projects.get(PROJECT_ID)!.projectedSeq = 0

    first.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()

    server = createServer()
    await server.listen()

    const restarted = await connectProvider({ url: server.wsUrl, name: roomName(), token })
    try {
      await restarted.synced
      await waitFor(() => !!findNode(restarted.document, 'snapshotted-node'))
      await waitFor(() => !!findNode(restarted.document, 'tail-node'))
      await waitFor(() => repository.getProjectedSeq(PROJECT_ID) === repository.getDurableSeq(PROJECT_ID))

      assert.equal(findNode(restarted.document, 'snapshotted-node')?.data.label, 'snapshot')
      assert.equal(findNode(restarted.document, 'tail-node')?.data.label, 'tail')
      assert.equal(repository.getProjectedSeq(PROJECT_ID), 2)
    } finally {
      restarted.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 0)
    }
  } finally {
    await server.destroy()
  }
})

databaseIntegrationTest('DB-backed hard restart rehydrates from snapshot plus updates and catches projection lag up to durable seq', async ({
  pool,
  database,
  repository,
  projectIds,
}) => {
  const projectId = await createProject(pool, { userId: OWNER_USER_ID })
  projectIds.push(projectId)

  const createServer = () => createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database: new FakeAuthorizationDatabase(),
    createRuntime: createDatabaseRuntimeFactory(repository, database),
  })

  let server = createServer()
  await server.listen()
  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId }, JWT_SECRET)).token
  const first = await connectProvider({ url: server.wsUrl, name: roomName(projectId), token })

  try {
    await first.synced

    upsertNode(first.document, {
      id: 'snapshotted-node',
      type: 'prompt',
      position: { x: 10, y: 10 },
      data: { label: 'snapshot' },
    })
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 1))
    await repository.compact(projectId, Y.encodeStateAsUpdate(first.document), 1, CURRENT_SCHEMA_VERSION)

    upsertNode(first.document, {
      id: 'tail-node',
      type: 'image',
      position: { x: 20, y: 20 },
      data: { label: 'tail' },
    })
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 2))
    await pool.query('UPDATE canvas_yjs_documents SET projected_seq = 0 WHERE project_id = $1', [projectId])

    first.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()

    server = createServer()
    await server.listen()

    const restarted = await connectProvider({ url: server.wsUrl, name: roomName(projectId), token })
    try {
      await restarted.synced
      await waitFor(() => !!findNode(restarted.document, 'snapshotted-node'))
      await waitFor(() => !!findNode(restarted.document, 'tail-node'))
      await waitForAsync(async () => {
        const state = await loadDocumentState(pool, projectId)
        return state.durableSeq === 2 && state.projectedSeq === 2
      })

      assert.equal(findNode(restarted.document, 'snapshotted-node')?.data.label, 'snapshot')
      assert.equal(findNode(restarted.document, 'tail-node')?.data.label, 'tail')
      assert.deepEqual(await loadProjectedNodeIds(pool, projectId), ['snapshotted-node', 'tail-node'])
    } finally {
      restarted.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 0)
    }
  } finally {
    await server.destroy()
  }
})

test('persistence outage degrades to bounded read-only and recovers back to persisted writable collaboration', async () => {
  const repository = new InMemoryRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)
  repository.seedProject(PROJECT_ID, createCanvasDocument())
  repository.appendFailuresRemaining = 1_000

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
    createRuntime: createRuntimeFactory(repository, {
      maxQueuedUpdates: 2,
      maxQueuedBytes: 1_000_000,
    }),
  })

  await server.listen()
  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const first = await connectProvider({ url: server.wsUrl, name: roomName(), token })
  let second = await connectProvider({ url: server.wsUrl, name: roomName(), token })

  try {
    await Promise.all([first.synced, second.synced])

    upsertNode(first.document, {
      id: 'queued-1',
      type: 'prompt',
      position: { x: 1, y: 1 },
      data: { label: 'first' },
    })
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'DEGRADED'))

    upsertNode(first.document, {
      id: 'queued-2',
      type: 'prompt',
      position: { x: 2, y: 2 },
      data: { label: 'second' },
    })
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'))
    await waitFor(() => second.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'))

    upsertNode(second.document, {
      id: 'blocked-3',
      type: 'prompt',
      position: { x: 3, y: 3 },
      data: { label: 'blocked' },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(findNode(first.document, 'blocked-3'), undefined)

    const blockedVisibleLocally = !!findNode(second.document, 'blocked-3')
    assert.equal(first.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'), true)
    assert.equal(second.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'READ_ONLY'), true)

    if (blockedVisibleLocally) {
      second.provider.destroy()
      await waitFor(() => server.getConnectionCount() === 1)
      second = await connectProvider({ url: server.wsUrl, name: roomName(), token })
      await second.synced
      assert.equal(findNode(second.document, 'blocked-3'), undefined)
    }

    repository.appendFailuresRemaining = 0
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 1))
    await waitFor(() => first.statelessMessages.some((message) => message.type === 'STATUS' && message.status === 'SYNCED'))

    upsertNode(second.document, {
      id: 'recovered-4',
      type: 'image',
      position: { x: 4, y: 4 },
      data: { label: 'recovered' },
    })

    await waitFor(() => second.statelessMessages.some((message) => message.type === 'ACK' && message.seq === 2))
    await waitFor(() => !!findNode(first.document, 'recovered-4'))
    await waitFor(() => !!findNode(second.document, 'recovered-4'))

    assert.equal(repository.getDurableSeq(PROJECT_ID), 2)
    assert.equal(findNode(first.document, 'queued-1')?.data.label, 'first')
    assert.equal(findNode(first.document, 'queued-2')?.data.label, 'second')
  } finally {
    first.provider.destroy()
    second.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

async function loadDocumentState(
  pool: Pool,
  projectId: string,
): Promise<{ snapshotSeq: number; durableSeq: number; projectedSeq: number }> {
  const result = await pool.query<{
    snapshot_seq: number | string
    durable_seq: number | string
    projected_seq: number | string
  }>(
    `
      SELECT snapshot_seq, durable_seq, projected_seq
      FROM canvas_yjs_documents
      WHERE project_id = $1
    `,
    [projectId],
  )

  const row = result.rows[0]
  assert.ok(row, `expected durable document for project ${projectId}`)
  return {
    snapshotSeq: Number(row.snapshot_seq),
    durableSeq: Number(row.durable_seq),
    projectedSeq: Number(row.projected_seq),
  }
}

async function loadProjectedNodeIds(pool: Pool, projectId: string): Promise<string[]> {
  const result = await pool.query<{ nodeid: string }>(
    `
      SELECT nodeId
      FROM canvas_nodes
      WHERE projectId = $1::text
      ORDER BY nodeId ASC
    `,
    [projectId],
  )

  return result.rows.map((row) => row.nodeid)
}

async function createProject(
  pool: Pool,
  {
    userId = randomUUID(),
    scenes = [{ id: 'scene-1', name: 'Scene 1' }],
    activeSceneId = 'scene-1',
    legacyNodes = [],
    legacyEdges = [],
  }: {
    userId?: string
    scenes?: Array<{ id: string; name: string }>
    activeSceneId?: string | null
    legacyNodes?: Array<{
      id: string
      type: string
      positionX: number
      positionY: number
      data: Record<string, unknown>
    }>
    legacyEdges?: Array<{
      id: string
      source: string
      target: string
      sourceHandle: string | null
      targetHandle: string | null
      animated: boolean
      data: Record<string, unknown>
    }>
  } = {},
): Promise<string> {
  const projectId = randomUUID()

  await pool.query(
    `
      INSERT INTO projects (id, userid, name, description, scenes, active_scene_id, createdat, updatedat)
      VALUES ($1, $2, $3, '', $4::jsonb, $5, NOW(), NOW())
    `,
    [projectId, userId, `Project ${projectId}`, JSON.stringify(scenes), activeSceneId],
  )

  for (const node of legacyNodes) {
    await pool.query(
      `
        INSERT INTO canvas_nodes (projectId, nodeId, type, position_x, position_y, data)
        VALUES ($1::text, $2, $3, $4, $5, $6::jsonb)
      `,
      [projectId, node.id, node.type, node.positionX, node.positionY, JSON.stringify(node.data)],
    )
  }

  for (const edge of legacyEdges) {
    await pool.query(
      `
        INSERT INTO canvas_edges (
          projectId,
          edgeId,
          source,
          target,
          sourceHandle,
          targetHandle,
          animated,
          data
        )
        VALUES ($1::text, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        projectId,
        edge.id,
        edge.source,
        edge.target,
        edge.sourceHandle,
        edge.targetHandle,
        edge.animated,
        JSON.stringify(edge.data),
      ],
    )
  }

  return projectId
}
