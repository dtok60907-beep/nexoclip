import assert from 'node:assert/strict'
import test from 'node:test'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { SignJWT } from 'jose'
import * as Y from 'yjs'

import { issueRealtimeToken, REALTIME_TOKEN_AUDIENCE, REALTIME_TOKEN_ALGORITHM, REALTIME_TOKEN_ISSUER } from './auth'
import {
  createCanvasAuthorizationActionDigest,
  signCanvasAuthorization,
} from './internal-auth'
import { createRealtimeServer } from './server'
import { createCanvasDocument, readCanvasProjection, upsertNode } from '../lib/realtime/document'
import type { DatabaseAdapter, QueryResult } from './db'

const JWT_SECRET = 'jwt-secret'
const CANVAS_AUTH_SECRET = 'canvas-secret'
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440099'
const OWNER_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const OTHER_USER_ID = '550e8400-e29b-41d4-a716-446655440002'

function roomName(projectId = PROJECT_ID) {
  return `project:${projectId}`
}

type LoadedProjectDocument = {
  doc: Y.Doc
  snapshotSeq: number
  durableSeq: number
  projectedSeq: number
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

class FakeRealtimeRepository {
  readonly ownsCalls: Array<{ projectId: string; userId: string }> = []
  readonly loadCalls: string[] = []
  readonly docs = new Map<string, LoadedProjectDocument>()
  readonly owners = new Map<string, Set<string>>()

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
    this.ownsCalls.push({ projectId, userId })
    return this.owners.get(projectId)?.has(userId) ?? false
  }

  async loadOrImport(projectId: string): Promise<LoadedProjectDocument> {
    this.loadCalls.push(projectId)
    const loaded = this.docs.get(projectId)
    assert.ok(loaded, `expected preloaded document for ${projectId}`)
    return {
      doc: cloneDoc(loaded.doc),
      snapshotSeq: loaded.snapshotSeq,
      durableSeq: loaded.durableSeq,
      projectedSeq: loaded.projectedSeq,
    }
  }

  async appendUpdate(projectId: string, update: Uint8Array): Promise<number> {
    const loaded = this.docs.get(projectId)
    assert.ok(loaded, `expected preloaded document for ${projectId}`)
    Y.applyUpdate(loaded.doc, update)
    loaded.durableSeq += 1
    return loaded.durableSeq
  }

  async compact(projectId: string, snapshot: Uint8Array, includedSeq: number): Promise<void> {
    const loaded = this.docs.get(projectId)
    assert.ok(loaded, `expected preloaded document for ${projectId}`)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, snapshot)
    loaded.doc = doc
    loaded.snapshotSeq = includedSeq
    loaded.projectedSeq = Math.max(loaded.projectedSeq, includedSeq)
  }

  async close(): Promise<void> {}
}

function cloneDoc(source: Y.Doc): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source))
  return doc
}

class FakeRuntime {
  readonly enqueueCalls: Uint8Array[] = []

  async enqueue(update: Uint8Array): Promise<number> {
    this.enqueueCalls.push(new Uint8Array(update))
    return this.enqueueCalls.length
  }
}

class DeferredRuntime {
  readonly enqueueCalls: Uint8Array[] = []
  readonly orderedFacts: string[] = []
  readonly enqueueDeferred = deferred<number>()
  readonly flushDeferred = deferred<void>()

  async enqueue(update: Uint8Array): Promise<number> {
    this.enqueueCalls.push(new Uint8Array(update))
    this.orderedFacts.push('ENQUEUE')
    const durableSeq = await this.enqueueDeferred.promise
    this.orderedFacts.push('NEON_COMMIT')
    return durableSeq
  }

  async flush(): Promise<void> {
    this.orderedFacts.push('FLUSH')
    await this.flushDeferred.promise
    this.orderedFacts.push('FLUSH_DONE')
  }
}

class ThrowingRuntime {
  constructor(private readonly error: Error) {}

  async enqueue(): Promise<number> {
    throw this.error
  }

  async flush(): Promise<void> {}
}

class FakeAuthorizationDatabase implements DatabaseAdapter {
  readonly usedNonces = new Set<string>()
  readonly ownership = new Set<string>()
  readonly operations: string[] = []
  ownershipLookups = 0

  allow(projectId: string, userId: string): void {
    this.ownership.add(`${projectId}:${userId}`)
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<QueryResult<Row>> {
    throw new Error('query should not be called directly in authorization tests')
  }

  async transaction<T>(work: (client: { query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<Row>> }) => Promise<T>): Promise<T> {
    return work({
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> => {
        const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()

        if (normalized.includes('insert into canvas_auth_nonces')) {
          this.operations.push('insert-nonce')
          const nonce = String(params[0])
          if (this.usedNonces.has(nonce)) {
            const error = new Error('duplicate nonce') as Error & { code?: string }
            error.code = '23505'
            throw error
          }
          this.usedNonces.add(nonce)
          return { rows: [], rowCount: 1 } as QueryResult<Row>
        }

        if (normalized.includes('select 1 from projects where id = $1 and userid = $2 limit 1')) {
          this.operations.push('check-ownership')
          this.ownershipLookups += 1
          const key = `${String(params[0])}:${String(params[1])}`
          return {
            rows: this.ownership.has(key)
              ? ([{ '?column?': 1 }] as unknown as Row[])
              : [],
            rowCount: this.ownership.has(key) ? 1 : 0,
          }
        }

        if (normalized.includes('delete from canvas_auth_nonces')) {
          this.operations.push('cleanup-expired-nonces')
          return { rows: [], rowCount: 0 } as QueryResult<Row>
        }

        throw new Error(`Unexpected authorization query: ${text}`)
      },
    })
  }

  async close(): Promise<void> {}
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

async function issueExpiredToken({ userId = OWNER_USER_ID, projectId = PROJECT_ID } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ projectId })
    .setProtectedHeader({ alg: REALTIME_TOKEN_ALGORITHM, typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(REALTIME_TOKEN_ISSUER)
    .setAudience(REALTIME_TOKEN_AUDIENCE)
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 60)
    .sign(new TextEncoder().encode(JWT_SECRET))
}

function emptyStateBytes(doc: Y.Doc): number {
  return Y.encodeStateAsUpdate(doc).byteLength
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
}) {
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
    awareness: null,
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
  }
}

test('private /internal/authorize inserts nonce before ownership lookup and rejects replay', async () => {
  const repository = new FakeRealtimeRepository()
  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
  })

  await server.listen()

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const payload = {
      userId: OWNER_USER_ID,
      projectId: PROJECT_ID,
      timestamp,
      nonce: 'nonce-123',
    }

    const response = await fetch(`${server.httpUrl}/internal/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { authorized: true })
    assert.deepEqual(database.operations, ['insert-nonce', 'check-ownership'])
    assert.equal(database.ownershipLookups, 1)

    const replay = await fetch(`${server.httpUrl}/internal/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      }),
    })

    assert.equal(replay.status, 403)
    assert.deepEqual(await replay.json(), { authorized: false })
    assert.deepEqual(database.operations, ['insert-nonce', 'check-ownership', 'insert-nonce'])
    assert.equal(database.ownershipLookups, 1)

    const deniedPayload = {
      userId: OTHER_USER_ID,
      projectId: PROJECT_ID,
      timestamp,
      nonce: 'nonce-456',
    }

    const denied = await fetch(`${server.httpUrl}/internal/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...deniedPayload,
        signature: signCanvasAuthorization(deniedPayload, CANVAS_AUTH_SECRET),
      }),
    })

    assert.equal(denied.status, 403)
    assert.deepEqual(await denied.json(), { authorized: false })
    assert.deepEqual(database.operations, [
      'insert-nonce',
      'check-ownership',
      'insert-nonce',
      'insert-nonce',
      'check-ownership',
    ])
    assert.equal(database.ownershipLookups, 2)
  } finally {
    await server.destroy()
  }
})

test('GET /healthz returns ok without touching realtime authorization', async () => {
  const repository = new FakeRealtimeRepository()
  const database = new FakeAuthorizationDatabase()

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
  })

  await server.listen()

  try {
    const response = await fetch(`${server.httpUrl}/healthz`)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.deepEqual(database.operations, [])
    assert.deepEqual(repository.loadCalls, [])
  } finally {
    await server.destroy()
  }
})

test('private /internal/document exports and patches authoritative documents', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'imageGen',
    position: { x: 10, y: 20 },
    data: {
      pendingRequestId: 'req-123',
      pendingFalEndpoint: 'fal-ai/flux/dev',
      prompt: 'hello',
    },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
  })

  await server.listen()

  const createBody = (nonce: string, action: Record<string, unknown>) => {
    const actionPayload = {
      ...action,
    }
    const payload = {
      userId: OWNER_USER_ID,
      projectId: PROJECT_ID,
      timestamp: Math.floor(Date.now() / 1000),
      nonce,
      actionDigest: createCanvasAuthorizationActionDigest(actionPayload),
    }

    return {
      ...payload,
      signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      ...actionPayload,
    }
  }

  try {
    const beforeResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-export-before', { action: 'export-document' })),
    })

    assert.equal(beforeResponse.status, 200)
    const beforeBody = await beforeResponse.json()
    assert.equal(beforeBody.projection.nodes[0].data.pendingRequestId, 'req-123')

    const patchResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-patch', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: {
          outputUrl: '/uploads/generated.png',
          status: 'completed',
          error: null,
        },
        unset: ['pendingRequestId', 'pendingFalEndpoint'],
      })),
    })

    assert.equal(patchResponse.status, 200)

    const afterResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-export-after', { action: 'export-document' })),
    })

    assert.equal(afterResponse.status, 200)
    const afterBody = await afterResponse.json()
    assert.equal(afterBody.projection.nodes[0].data.outputUrl, '/uploads/generated.png')
    assert.equal('pendingRequestId' in afterBody.projection.nodes[0].data, false)
    assert.equal(afterBody.durableSeq, 1)
  } finally {
    await server.destroy()
  }
})

test('private /internal/document applies committed updates to the live room only after enqueue and flush complete', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'imageGen',
    position: { x: 10, y: 20 },
    data: {
      pendingRequestId: 'req-123',
      pendingFalEndpoint: 'fal-ai/flux/dev',
      prompt: 'hello',
    },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  const runtime = new DeferredRuntime()
  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
    createRuntime: () => runtime,
  })

  await server.listen()

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const observer = await connectProvider({
    url: server.wsUrl,
    name: roomName(PROJECT_ID),
    token,
  })

  const createBody = (nonce: string, action: Record<string, unknown>) => {
    const actionPayload = {
      ...action,
    }
    const payload = {
      userId: OWNER_USER_ID,
      projectId: PROJECT_ID,
      timestamp: Math.floor(Date.now() / 1000),
      nonce,
      actionDigest: createCanvasAuthorizationActionDigest(actionPayload),
    }

    return {
      ...payload,
      signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      ...actionPayload,
    }
  }

  try {
    await observer.synced

    observer.document.on('update', () => {
      runtime.orderedFacts.push('LIVE_DOC_UPDATE')
    })

    const patchPromise = fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-live-ordering', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: {
          outputUrl: '/uploads/generated.png',
          status: 'completed',
        },
        unset: ['pendingRequestId', 'pendingFalEndpoint'],
      })),
    })

    await waitFor(() => runtime.enqueueCalls.length === 1)
    assert.equal(readCanvasProjection(observer.document).nodes[0].data.outputUrl, undefined)
    assert.equal(runtime.orderedFacts.includes('LIVE_DOC_UPDATE'), false)

    runtime.enqueueDeferred.resolve(7)
    await waitFor(() => runtime.orderedFacts.includes('FLUSH'))
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(readCanvasProjection(observer.document).nodes[0].data.outputUrl, undefined)
    assert.equal(runtime.orderedFacts.includes('LIVE_DOC_UPDATE'), false)

    runtime.flushDeferred.resolve()
    const patchResponse = await patchPromise
    assert.equal(patchResponse.status, 200)
    await waitFor(() => readCanvasProjection(observer.document).nodes[0].data.outputUrl === '/uploads/generated.png')

    assert.deepEqual(
      runtime.orderedFacts.filter((fact) => ['ENQUEUE', 'NEON_COMMIT', 'FLUSH', 'FLUSH_DONE', 'LIVE_DOC_UPDATE'].includes(fact)),
      ['ENQUEUE', 'NEON_COMMIT', 'FLUSH', 'FLUSH_DONE', 'LIVE_DOC_UPDATE'],
    )
  } finally {
    observer.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('private /internal/document leaves the live room unchanged when enqueue rejects', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'imageGen',
    position: { x: 10, y: 20 },
    data: {
      pendingRequestId: 'req-123',
      pendingFalEndpoint: 'fal-ai/flux/dev',
      prompt: 'hello',
    },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
    createRuntime: () => new ThrowingRuntime(new Error('database offline')),
  })

  await server.listen()

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const observer = await connectProvider({
    url: server.wsUrl,
    name: roomName(PROJECT_ID),
    token,
  })

  const createBody = (nonce: string, action: Record<string, unknown>) => {
    const actionPayload = {
      ...action,
    }
    const payload = {
      userId: OWNER_USER_ID,
      projectId: PROJECT_ID,
      timestamp: Math.floor(Date.now() / 1000),
      nonce,
      actionDigest: createCanvasAuthorizationActionDigest(actionPayload),
    }

    return {
      ...payload,
      signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      ...actionPayload,
    }
  }

  try {
    await observer.synced

    const patchResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-live-reject', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: {
          outputUrl: '/uploads/generated.png',
        },
      })),
    })

    assert.equal(patchResponse.status, 500)
    assert.deepEqual(await patchResponse.json(), { error: 'database offline' })
    assert.equal(readCanvasProjection(observer.document).nodes[0].data.outputUrl, undefined)

    const afterResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-export-after-reject', { action: 'export-document' })),
    })

    assert.equal(afterResponse.status, 200)
    const afterBody = await afterResponse.json()
    assert.equal(afterBody.projection.nodes[0].data.outputUrl, undefined)
    assert.equal(afterBody.durableSeq, 0)
  } finally {
    observer.provider.destroy()
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

test('private /internal/document maps validation, read-only conflicts, service unavailability, and unexpected backend failures', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'imageGen',
    position: { x: 10, y: 20 },
    data: { prompt: 'hello' },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  let runtimeMode: 'read-only' | 'shutdown' | 'backend' = 'read-only'
  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
    createRuntime: () => {
      if (runtimeMode === 'read-only') {
        return new ThrowingRuntime(new Error(`Project ${PROJECT_ID} runtime is read-only`))
      }
      if (runtimeMode === 'shutdown') {
        return new ThrowingRuntime(new Error('server shutting down'))
      }
      return new ThrowingRuntime(new Error('database offline'))
    },
  })

  await server.listen()

  const createBody = (nonce: string, action: Record<string, unknown>) => {
    const actionPayload = {
      ...action,
    }
    const payload = {
      userId: OWNER_USER_ID,
      projectId: PROJECT_ID,
      timestamp: Math.floor(Date.now() / 1000),
      nonce,
      actionDigest: createCanvasAuthorizationActionDigest(actionPayload),
    }

    return {
      ...payload,
      signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
      ...actionPayload,
    }
  }

  try {
    const validationResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-validation', {
        action: 'replace-document',
      })),
    })

    assert.equal(validationResponse.status, 400)
    assert.deepEqual(await validationResponse.json(), { error: 'projection is required' })

    runtimeMode = 'read-only'
    const readOnlyResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-read-only', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: { outputUrl: '/uploads/generated.png' },
      })),
    })

    assert.equal(readOnlyResponse.status, 409)
    assert.deepEqual(await readOnlyResponse.json(), { error: `Project ${PROJECT_ID} runtime is read-only` })

    runtimeMode = 'shutdown'
    const shutdownResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-shutdown', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: { outputUrl: '/uploads/generated.png' },
      })),
    })

    assert.equal(shutdownResponse.status, 503)
    assert.deepEqual(await shutdownResponse.json(), { error: 'server shutting down' })

    runtimeMode = 'backend'
    const backendResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody('nonce-backend', {
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: { outputUrl: '/uploads/generated.png' },
      })),
    })

    assert.equal(backendResponse.status, 500)
    assert.deepEqual(await backendResponse.json(), { error: 'database offline' })
  } finally {
    await server.destroy()
  }
})

test('private /internal/document rejects action bodies that do not match the signed payload', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'imageGen',
    position: { x: 10, y: 20 },
    data: {
      pendingRequestId: 'req-123',
      pendingFalEndpoint: 'fal-ai/flux/dev',
      prompt: 'hello',
    },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const database = new FakeAuthorizationDatabase()
  database.allow(PROJECT_ID, OWNER_USER_ID)

  const server = createRealtimeServer({
    checkSession: async () => true,
    address: '127.0.0.1',
    port: 0,
    env: {
      REALTIME_TOKEN_SECRET: JWT_SECRET,
      CANVAS_AUTH_SECRET,
    },
    repository,
    database,
  })

  await server.listen()

  const signedAction = {
    action: 'export-document',
  }
  const signedPayload = {
    userId: OWNER_USER_ID,
    projectId: PROJECT_ID,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: 'nonce-tampered-action',
    actionDigest: createCanvasAuthorizationActionDigest(signedAction),
  }

  try {
    const tamperedResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...signedPayload,
        signature: signCanvasAuthorization(signedPayload, CANVAS_AUTH_SECRET),
        action: 'patch-node-data',
        nodeId: 'seed-node',
        set: {
          outputUrl: '/uploads/tampered.png',
        },
      }),
    })

    assert.equal(tamperedResponse.status, 403)
    assert.deepEqual(await tamperedResponse.json(), { authorized: false })
    assert.deepEqual(database.operations, [])

    const afterResponse = await fetch(`${server.httpUrl}/internal/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify((() => {
        const action = { action: 'export-document' }
        const payload = {
          userId: OWNER_USER_ID,
          projectId: PROJECT_ID,
          timestamp: Math.floor(Date.now() / 1000),
          nonce: 'nonce-export-after-tamper',
          actionDigest: createCanvasAuthorizationActionDigest(action),
        }

        return {
          ...payload,
          signature: signCanvasAuthorization(payload, CANVAS_AUTH_SECRET),
          ...action,
        }
      })()),
    })

    assert.equal(afterResponse.status, 200)
    const afterBody = await afterResponse.json()
    assert.equal(afterBody.projection.nodes[0].data.outputUrl, undefined)
    assert.equal(afterBody.durableSeq, 0)
  } finally {
    await server.destroy()
  }
})

test('unauthorized websocket connections receive no room access, no hydration, and no sync bytes', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'prompt',
    position: { x: 10, y: 20 },
    data: { label: 'seeded' },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const runtime = new FakeRuntime()
  const events: Array<{ type: string; connectionId?: string }> = []
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
    onEvent: (event) => {
      events.push({ type: event.type, connectionId: event.connectionId })
    },
  })

  await server.listen()

  const invalidCases = [
    {
      name: 'invalid token',
      token: 'not-a-jwt',
    },
    {
      name: 'expired token',
      token: await issueExpiredToken(),
    },
    {
      name: 'non-owner token',
      token: (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OTHER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token,
    },
    {
      name: 'wrong-project token',
      token: (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: OTHER_PROJECT_ID }, JWT_SECRET)).token,
    },
  ]

  try {
    for (const invalidCase of invalidCases) {
      const clientDoc = new Y.Doc()
      const baselineBytes = emptyStateBytes(clientDoc)
      const eventCountBeforeConnect = events.length
      const { provider, outcome } = await connectProvider({
        url: server.wsUrl,
        name: roomName(PROJECT_ID),
        token: invalidCase.token,
        document: clientDoc,
      })

      const result = await outcome
      assert.notEqual(result, 'authenticated', `${invalidCase.name} unexpectedly authenticated`)
      await waitFor(() => provider.isAuthenticated === false)
      assert.equal(emptyStateBytes(clientDoc), baselineBytes, `${invalidCase.name} received document state bytes`)
      assert.equal(
        events.slice(eventCountBeforeConnect).some((event) => event.type === 'ws:load-document' || event.type === 'ws:before-sync'),
        false,
        `${invalidCase.name} progressed past authorization failure`,
      )
      provider.destroy()
    }

    assert.deepEqual(repository.loadCalls, [])
    assert.equal(runtime.enqueueCalls.length, 0)
    assert.equal(events.some((event) => event.type === 'ws:before-sync'), false)
    assert.equal(server.getConnectionCount(), 0)
  } finally {
    await server.destroy()
  }
})

test('authorized owners hydrate only after authorization, more than three clients can join, changes converge, onChange enqueues exact bytes, and disconnect releases connection refs', async () => {
  const repository = new FakeRealtimeRepository()
  repository.setOwner(PROJECT_ID, OWNER_USER_ID)

  const seededDoc = createCanvasDocument()
  upsertNode(seededDoc, {
    id: 'seed-node',
    type: 'prompt',
    position: { x: 10, y: 20 },
    data: { label: 'seeded' },
  })
  repository.setDocument(PROJECT_ID, seededDoc)

  const runtime = new FakeRuntime()
  const events: Array<{ type: string; connectionId?: string }> = []
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
    onEvent: (event) => {
      events.push({ type: event.type, connectionId: event.connectionId })
    },
  })

  await server.listen()

  const token = (await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: OWNER_USER_ID, projectId: PROJECT_ID }, JWT_SECRET)).token
  const clients = await Promise.all([
    connectProvider({ url: server.wsUrl, name: roomName(PROJECT_ID), token }),
    connectProvider({ url: server.wsUrl, name: roomName(PROJECT_ID), token }),
    connectProvider({ url: server.wsUrl, name: roomName(PROJECT_ID), token }),
    connectProvider({ url: server.wsUrl, name: roomName(PROJECT_ID), token }),
  ])

  try {
    await Promise.all(clients.map((client) => client.synced))

    assert.equal(repository.loadCalls.length, 1)
    assert.equal(readCanvasProjection(clients[0].document).nodes.some((node) => node.id === 'seed-node'), true)
    assert.equal(server.getConnectionCount(), 4)

    const lifecycleEventsByConnection = new Map<string, string[]>()
    for (const event of events) {
      if (!event.connectionId) continue
      const connectionEvents = lifecycleEventsByConnection.get(event.connectionId) ?? []
      connectionEvents.push(event.type)
      lifecycleEventsByConnection.set(event.connectionId, connectionEvents)
    }

    const authorizedConnectionIds = [...new Set(
      events
        .filter((event) => event.type === 'ws:authorized' && typeof event.connectionId === 'string')
        .map((event) => event.connectionId as string),
    )]
    assert.equal(authorizedConnectionIds.length, clients.length)

    for (const connectionId of authorizedConnectionIds) {
      const connectionEvents = lifecycleEventsByConnection.get(connectionId) ?? []
      const authIndex = connectionEvents.indexOf('ws:authorized')
      const hydrateIndex = connectionEvents.indexOf('ws:load-document')
      const syncIndex = connectionEvents.indexOf('ws:before-sync')
      assert.notEqual(authIndex, -1, `missing auth event for ${connectionId}`)
      assert.notEqual(syncIndex, -1, `missing sync event for ${connectionId}`)
      assert.ok(authIndex < syncIndex, `expected auth before sync for ${connectionId}: ${connectionEvents.join(' -> ')}`)
      if (hydrateIndex !== -1) {
        assert.ok(authIndex < hydrateIndex, `expected auth before load for ${connectionId}: ${connectionEvents.join(' -> ')}`)
        assert.ok(hydrateIndex < syncIndex, `expected load before sync for ${connectionId}: ${connectionEvents.join(' -> ')}`)
      }
    }

    let localUpdate: Uint8Array | null = null
    clients[0].document.on('update', (update) => {
      localUpdate = new Uint8Array(update)
    })

    upsertNode(clients[0].document, {
      id: 'shared-node',
      type: 'image',
      position: { x: 30, y: 40 },
      data: { label: 'shared' },
    })

    await waitFor(() => runtime.enqueueCalls.length > 0)
    await waitFor(() => readCanvasProjection(clients[1].document).nodes.some((node) => node.id === 'shared-node'))

    assert.ok(localUpdate, 'expected local mutation to emit a Yjs update')
    assert.equal(Buffer.compare(Buffer.from(runtime.enqueueCalls[0]), Buffer.from(localUpdate)), 0)
    assert.equal(readCanvasProjection(clients[1].document).nodes.some((node) => node.id === 'shared-node'), true)
    assert.equal(readCanvasProjection(clients[2].document).nodes.some((node) => node.id === 'shared-node'), true)
    assert.equal(readCanvasProjection(clients[3].document).nodes.some((node) => node.id === 'shared-node'), true)
  } finally {
    for (const client of clients) {
      client.provider.destroy()
    }
    await waitFor(() => server.getConnectionCount() === 0)
    await server.destroy()
  }
})

for (const mode of ['idle revocation', 'mutation revocation', 'database failure'] as const) {
  test(`realtime disconnects on ${mode}, denies old tokens, and preserves other sessions`, async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440010'
    const otherSessionId = '550e8400-e29b-41d4-a716-446655440011'
    const repository = new FakeRealtimeRepository()
    repository.setOwner(PROJECT_ID, OWNER_USER_ID)
    repository.setDocument(PROJECT_ID, createCanvasDocument())
    const runtime = new FakeRuntime()
    let revoked = false
    const server = createRealtimeServer({
      address: '127.0.0.1', port: 0, repository,
      database: new FakeAuthorizationDatabase(),
      env: { REALTIME_TOKEN_SECRET: JWT_SECRET },
      sessionCheckIntervalMs: mode === 'mutation revocation' ? 60_000 : 20,
      checkSession: async identity => {
        assert.equal(identity.userId, OWNER_USER_ID)
        if (identity.sessionId !== sessionId) return true
        if (revoked && mode === 'database failure') throw new Error('private database credentials')
        return !revoked
      },
      createRuntime: () => runtime,
    })
    await server.listen()
    const token = (await issueRealtimeToken({ userId: OWNER_USER_ID, projectId: PROJECT_ID, sessionId }, JWT_SECRET)).token
    const otherToken = (await issueRealtimeToken({ userId: OWNER_USER_ID, projectId: PROJECT_ID, sessionId: otherSessionId }, JWT_SECRET)).token
    const client = await connectProvider({ url: server.wsUrl, name: roomName(), token })
    const other = await connectProvider({ url: server.wsUrl, name: roomName(), token: otherToken })
    try {
      await Promise.all([client.synced, other.synced])
      assert.equal(server.getConnectionCount(), 2)
      const baseline = runtime.enqueueCalls.length
      revoked = true
      if (mode === 'mutation revocation') client.document.getMap('attack').set('write', 'blocked')
      await waitFor(() => server.getConnectionCount() === 1)
      assert.equal(runtime.enqueueCalls.length, baseline, 'invalid session persisted a write')
      assert.equal(other.provider.isAuthenticated, true)
      const retry = await connectProvider({ url: server.wsUrl, name: roomName(), token })
      try { assert.notEqual(await retry.outcome, 'authenticated') } finally { retry.provider.destroy() }
      assert.equal(server.getConnectionCount(), 1)
      // Reactivation/new login cannot restore the revoked session; only a new session token works.
      other.document.getMap('valid').set('write', 'allowed')
      await waitFor(() => runtime.enqueueCalls.length > baseline)
    } finally {
      client.provider.destroy()
      other.provider.destroy()
      await server.destroy()
    }
  })
}
