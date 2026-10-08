import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../src/services/tenantContext.js';
import { createImageGenerationJobWithReservation, toPublicGeneration } from '../../../src/services/generationService.js';
import { recoverQueuedGenerations, generationQueueName } from '../../../src/queue/generationQueue.js';
import { createBullMqGenerationQueue } from '../../../src/queue/bullmqGenerationQueue.js';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

function workspaceId(request) {
  return request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
}

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return Response.json({ error: error.message, code: error.code }, { status });
}

async function publishReservedGeneration({ pool, kind }) {
  if (!process.env.REDIS_URL) throw new Error('Generation queue is unavailable');
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createBullMqGenerationQueue({ Queue, Worker, connection, queueName: generationQueueName(kind) });
  try { await recoverQueuedGenerations({ pool, queue, kind }); }
  finally { await queue.close(); await connection.quit(); }
}

export function createGenerationsPostHandler({
  resolveContext = resolveTenantContext,
  reserve = createImageGenerationJobWithReservation,
  publish = publishReservedGeneration,
  pool = null,
  logError = console.error,
} = {}) {
  return async function POST(request) {
    try {
      const id = workspaceId(request);
      if (!id) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId: id });
      const input = await request.json();
      const idempotencyKey = input.idempotencyKey || request.headers.get('idempotency-key');
      const database = pool || (await import('../../../src/db/pool.js')).getPool();
      const generation = await reserve(database, tenant.workspace.id, { ...input, idempotencyKey }, { userId: tenant.user.id });
      try {
        await publish({ pool: database, kind: generation.kind });
      } catch (error) {
        logError({ event: 'generation_publication_deferred', generationId: generation.id, errorName: error?.name || 'Error', errorCode: error?.code || null });
      }
      return Response.json({ generation: toPublicGeneration(generation) }, { status: 201 });
    } catch (error) { return errorResponse(error); }
  };
}

export const POST = createGenerationsPostHandler();
