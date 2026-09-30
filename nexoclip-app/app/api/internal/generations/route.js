import { getPool } from '../../../../src/db/pool.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';
import { createImageGenerationJobWithReservation, getGenerationJob } from '../../../../src/services/generationService.js';
import { createStorage } from '../../../../src/services/assetService.js';
import { recoverQueuedGenerations, generationQueueName } from '../../../../src/queue/generationQueue.js';
import { createBullMqGenerationQueue } from '../../../../src/queue/bullmqGenerationQueue.js';
import { createCanvasAuthorizationActionDigest, verifyCanvasAuthorization } from '../../../../src/lib/realtime/internalAuth.js';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const ACTIONS = new Set(['submit', 'status', 'finalize-draft']);
const KINDS = new Set(['image', 'video']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validInput(input) {
  return input && typeof input === 'object'
    && KINDS.has(input.kind)
    && typeof input.prompt === 'string' && input.prompt.trim()
    && typeof input.model === 'string' && input.model.trim()
    && typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim();
}

async function readBody(request) {
  try { return await request.json(); }
  catch { return null; }
}

async function publishReservedGeneration({ pool, kind }) {
  if (!process.env.REDIS_URL) throw new Error('Generation queue is unavailable');
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createBullMqGenerationQueue({ Queue, Worker, connection, queueName: generationQueueName(kind) });
  try { await recoverQueuedGenerations({ pool, queue, kind }); }
  finally { await queue.close(); await connection.quit(); }
}

export function createInternalGenerationHandler({
  verify = (payload, signature) => verifyCanvasAuthorization(payload, signature, process.env.CANVAS_AUTH_SECRET),
  getDefaultWorkspace: findDefaultWorkspace = getDefaultWorkspace,
  reserve = createImageGenerationJobWithReservation,
  getGeneration = getGenerationJob,
  getPool: loadPool = getPool,
  createStorage: loadStorage = createStorage,
  publish = publishReservedGeneration,
  logError = console.error,
} = {}) {
  return async function POST(request) {
    try {
    const body = await readBody(request);
    const authorization = {
      userId: body?.userId,
      projectId: body?.projectId,
      timestamp: body?.timestamp,
      nonce: body?.nonce,
      actionDigest: createDigest(body),
    };
    if (!verify(authorization, body?.signature)) return Response.json({ error: 'Not found' }, { status: 404 });
    if (!ACTIONS.has(body?.action) || !UUID.test(body?.userId) || !UUID.test(body?.projectId) || !body?.nodeId) {
      return Response.json({ error: 'Invalid internal generation request' }, { status: 400 });
    }

    const workspace = await findDefaultWorkspace(body.userId);
    if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

    if (body.action === 'submit') {
      if (!validInput(body.input)) return Response.json({ error: 'Invalid internal generation request' }, { status: 400 });
      const pool = loadPool();
      const generation = await reserve(pool, workspace.id, {
        ...body.input,
        projectId: null,
        parameters: { ...(body.input.parameters || {}), canvasProjectId: body.projectId },
      }, {
        userId: body.userId,
        allowLegacyCanvasReferences: true,
      });
      try {
        await publish({ pool, kind: generation.kind });
      } catch (error) {
        logError({ event: 'generation_publication_deferred', generationId: generation.id, errorName: error?.name || 'Error', errorCode: error?.code || null });
      }
      return Response.json({ generation }, { status: 201 });
    }

    if (typeof body.generationId !== 'string' || !body.generationId) {
      return Response.json({ error: 'Invalid internal generation request' }, { status: 400 });
    }
    const generation = await getGeneration(workspace.id, body.generationId, loadStorage());
    if (body.action === 'finalize-draft') {
      // Drafts completed before the task id was stored on the job only have it
      // on their output row.
      const draftTaskId = generation?.provider_request_id || generation?.outputs?.[0]?.providerRequestId || null;
      if (!generation || generation.kind !== 'video' || generation.status !== 'succeeded' || !draftTaskId || !/seedance-2\.5/i.test(generation.model || '')) {
        return Response.json({ error: 'A completed Seedance 2.5 draft is required' }, { status: 422 });
      }
      const pool = loadPool();
      const finalGeneration = await reserve(pool, workspace.id, {
        kind: 'video',
        prompt: generation.prompt,
        model: generation.model,
        parameters: { resolution: '1080p', draftTaskId },
        idempotencyKey: `draft-final:${generation.id}`,
        projectId: null,
      }, { userId: body.userId, allowLegacyCanvasReferences: true });
      try { await publish({ pool, kind: 'video' }); }
      catch (error) { logError({ event: 'generation_publication_deferred', generationId: finalGeneration.id, errorName: error?.name || 'Error', errorCode: error?.code || null }); }
      return Response.json({ generation: finalGeneration }, { status: 201 });
    }
    if (!generation) return Response.json({ error: 'Generation not found' }, { status: 404 });
    return Response.json({ generation: canvasGeneration(generation, workspace.id) });
    } catch (error) {
      logError({
        event: 'internal_generation_request_failed',
        errorName: error?.name || 'Error',
        errorMessage: error?.message || 'Unknown internal generation error',
        errorCode: error?.code || null,
      });
      return Response.json({
        error: error?.message || 'Internal generation request failed',
      }, { status: 500 });
    }
  };
}

function canvasGeneration(generation, workspaceId) {
  return {
    ...generation,
    outputs: (generation.outputs || []).map((output) => ({
      ...output,
      download: { url: `/api/assets/${output.assetId}/download?workspace_id=${encodeURIComponent(workspaceId)}` },
    })),
  };
}

function createDigest(body) {
  try {
    return createCanvasAuthorizationActionDigest({
      action: body?.action,
      input: body?.input,
      generationId: body?.generationId,
    });
  } catch { return ''; }
}

export const POST = createInternalGenerationHandler();
