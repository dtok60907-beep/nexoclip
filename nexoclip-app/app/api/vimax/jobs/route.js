import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';
import { getPool } from '../../../../src/db/pool.js';
import { createVimaxGenerationJobWithReservation } from '../../../../src/services/generationService.js';
import { recoverQueuedGenerations, generationQueueName } from '../../../../src/queue/generationQueue.js';
import { createBullMqGenerationQueue } from '../../../../src/queue/bullmqGenerationQueue.js';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function queueForEnvironment() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('Generation queue is unavailable');
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = createBullMqGenerationQueue({ Queue, Worker, connection, queueName: generationQueueName('vimax') });
  return { queue, connection };
}

async function publishReservedGeneration({ pool }) {
  const { queue, connection } = queueForEnvironment();
  try {
    await recoverQueuedGenerations({ pool, queue, kind: 'vimax' });
  } finally {
    await queue.close();
    await connection.quit();
  }
}

function errorResponse(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  return Response.json({ error: 'Unable to create storyboard generation' }, { status: 500 });
}


export function createVimaxStoryboardJobHandler({
  getSession = getCurrentSession,
  getWorkspace = getDefaultWorkspace,
  reserve = createVimaxGenerationJobWithReservation,
  publish = publishReservedGeneration,
  logError = console.error,
  pool = null,
} = {}) {
  return async function POST(request) {
    const token = request.cookies?.get(SESSION_COOKIE)?.value;
    const session = await getSession(token);
    if (!session?.user_id) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const workspace = await getWorkspace(session.user_id);
    if (!workspace?.id) return Response.json({ error: 'No workspace is available' }, { status: 403 });

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    try {
      const database = pool || getPool();
      const job = await reserve(database, workspace.id, input, { userId: session.user_id });
      // Reservation commits before this recovery publisher runs. A publication failure
      // leaves the queued row recoverable by the worker startup/interval recovery path.
      try {
        await publish({ pool: database });
      } catch (error) {
        // The durable row is the source of truth; recovery will safely publish it.
        // Keep observability safe: do not log Redis URLs, credentials, or tokens.
        logError({
          event: 'vimax_job_publication_deferred',
          jobId: job.id,
          errorName: error?.name || 'Error',
          errorCode: error?.code || null,
        });
      }
      return Response.json({ id: job.id, status: job.status }, { status: 202 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const POST = createVimaxStoryboardJobHandler();
