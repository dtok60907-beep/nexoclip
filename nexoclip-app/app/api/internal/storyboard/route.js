import { createHash } from 'node:crypto';
import { getPool } from '../../../../src/db/pool.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';
import { createImageGenerationJobWithReservation, getGenerationJob, toPublicGeneration } from '../../../../src/services/generationService.js';
import { estimateGenerationCredits } from '../../../../src/services/generationPricing.js';
import { createAssetDownload, createStorage, importWorkspaceAsset } from '../../../../src/services/assetService.js';
import { appendCreditEntry } from '../../../../src/services/creditService.js';
import { findCreditEntryByIdempotencyKey } from '../../../../src/repositories/creditRepository.js';
import { MAX_INLINE_BYTES, analyzeVideo, videoAnalysisCredits } from '../../../../src/services/videoAnalysis.js';
import { audioCredits, generateElevenLabsAudio, validateAudioInput } from '../../../../src/services/elevenlabsAudio.js';
import { storyboardTextCredits } from '../../../../src/services/storyboardTextPricing.js';
import { recoverQueuedGenerations, generationQueueName } from '../../../../src/queue/generationQueue.js';
import { createBullMqGenerationQueue } from '../../../../src/queue/bullmqGenerationQueue.js';
import { verifyCanvasAuthorization } from '../../../../src/lib/realtime/internalAuth.js';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Server-to-server bridge shared by every internal AI tool that bills nexoclip
// credits (currently the AI Storyboards Director / Jellyfish, and OpenDirector).
// Image/video jobs go through the same credit reservation, queue and workers
// as Canvas; text (LLM) usage is billed straight to the credit ledger.
// Requests are HMAC-signed with the Canvas bridge secret over the exact JSON
// string in `request`, so both sides hash identical bytes. The signed scope is
// a label for bookkeeping only (`source` on the generation, `reason` prefix on
// text charges) — the real trust boundary is the shared secret itself, so any
// caller holding it may submit on behalf of the user it names, same as Canvas.
export const STORYBOARD_PROJECT_SCOPE = 'storyboard';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['submit', 'status', 'import-asset', 'download-asset', 'balance', 'charge-text', 'estimate', 'generate-audio', 'analyze-video']);
// Only the models these tools are configured with may be submitted.
export const STORYBOARD_MODELS = { image: 'bytedance-seed/seedream-4.5', video: 'byteplus/seedance-2.5-unfiltered' };
// Bookkeeping label for which internal tool made the request; must be one of these.
const SOURCES = new Set(['storyboard', 'director']);
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

async function publishReservedGeneration({ pool, kind }) {
  if (!process.env.REDIS_URL) throw new Error('Generation queue is unavailable');
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createBullMqGenerationQueue({ Queue, Worker, connection, queueName: generationQueueName(kind) });
  try { await recoverQueuedGenerations({ pool, queue, kind }); }
  finally { await queue.close(); await connection.quit(); }
}

async function readCreditBalance(pool, workspaceId) {
  const result = await pool.query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspaceId]);
  return Number(result.rows[0]?.balance ?? 0);
}

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

export function createInternalStoryboardHandler({
  verify = (payload, signature) => verifyCanvasAuthorization(payload, signature, process.env.CANVAS_AUTH_SECRET),
  getDefaultWorkspace: findDefaultWorkspace = getDefaultWorkspace,
  reserve = createImageGenerationJobWithReservation,
  getGeneration = getGenerationJob,
  getPool: loadPool = getPool,
  createStorage: loadStorage = createStorage,
  importAsset = importWorkspaceAsset,
  getDownload = createAssetDownload,
  publish = publishReservedGeneration,
  readBalance = readCreditBalance,
  appendCredit = appendCreditEntry,
  priceText = storyboardTextCredits,
  priceGeneration = estimateGenerationCredits,
  priceAudio = audioCredits,
  generateAudio = generateElevenLabsAudio,
  findCreditEntry = findCreditEntryByIdempotencyKey,
  watchVideo = analyzeVideo,
  priceVideoAnalysis = videoAnalysisCredits,
  fetchBytes = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer()),
  logError = console.error,
} = {}) {
  return async function POST(request) {
    let action = null;
    try {
      const body = await request.json().catch(() => null);
      const requestJson = typeof body?.request === 'string' ? body.request : null;
      const authorization = {
        userId: body?.userId,
        projectId: STORYBOARD_PROJECT_SCOPE,
        timestamp: body?.timestamp,
        nonce: body?.nonce,
        actionDigest: requestJson ? createHash('sha256').update(requestJson).digest('hex') : '',
      };
      if (!requestJson || !verify(authorization, body?.signature)) return Response.json({ error: 'Not found' }, { status: 404 });
      if (!UUID.test(body.userId)) return badRequest('Invalid storyboard request');
      let payload;
      try { payload = JSON.parse(requestJson); } catch { return badRequest('Invalid storyboard request'); }
      action = payload?.action;
      if (!ACTIONS.has(action)) return badRequest('Invalid storyboard action');

      const workspace = await findDefaultWorkspace(body.userId);
      if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });
      const pool = loadPool();

      if (action === 'balance') {
        return Response.json({ balance: await readBalance(pool, workspace.id) });
      }

      if (action === 'estimate' && payload.kind === 'audio') {
        const { usd, credits } = await priceAudio(payload.parameters || {});
        return Response.json({ credits, usd });
      }

      if (action === 'estimate') {
        const kind = payload.kind;
        if (!STORYBOARD_MODELS[kind] || payload.model !== STORYBOARD_MODELS[kind]) return badRequest('Unsupported storyboard model');
        if (typeof payload.prompt !== 'string') return badRequest('A prompt is required');
        const priced = await priceGeneration({ kind, model: payload.model, prompt: payload.prompt, parameters: payload.parameters || {} });
        if (!priced) return Response.json({ credits: 0, usd: 0 });
        return Response.json({ credits: priced.credits, usd: priced.usd });
      }

      const source = SOURCES.has(payload.source) ? payload.source : 'storyboard';

      if (action === 'charge-text') {
        const { model, inputTokens, outputTokens, cachedInputTokens = 0, idempotencyKey } = payload;
        if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200) return badRequest('idempotencyKey is required');
        const { usd, credits } = await priceText({ model, inputTokens, outputTokens, cachedInputTokens });
        if (credits <= 0) return Response.json({ credits: 0, balance: await readBalance(pool, workspace.id) });
        const entry = {
          workspaceId: workspace.id,
          reason: `${source}_text`,
          idempotencyKey: `${source}-text:${idempotencyKey}`,
          metadata: { model, inputTokens, cachedInputTokens, outputTokens, providerCostUsd: usd },
        };
        let charged = credits;
        try {
          await appendCredit(pool, { ...entry, amount: -credits });
        } catch (error) {
          if (error?.message !== 'Insufficient credits') throw error;
          // The model already answered, so take what is left rather than nothing;
          // the Jellyfish side refuses new LLM calls once the balance is empty.
          const balance = await readBalance(pool, workspace.id);
          charged = Math.max(0, Math.floor(balance * 10) / 10);
          if (charged > 0) await appendCredit(pool, { ...entry, amount: -charged, metadata: { ...entry.metadata, partial: true, quotedCredits: credits } });
        }
        return Response.json({ credits: charged, balance: await readBalance(pool, workspace.id) });
      }

      // Voiceover / music: generated in this request (ElevenLabs answers with the file), stored as an
      // asset and charged only once it exists. A retry with the same key returns the same asset.
      if (action === 'generate-audio') {
        const { idempotencyKey } = payload;
        if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200) return badRequest('idempotencyKey is required');
        const key = `${source}-audio:${idempotencyKey}`;
        const done = await findCreditEntry(pool, workspace.id, key);
        if (done?.metadata?.assetId) return Response.json({ assetId: done.metadata.assetId, credits: -Number(done.amount) });
        const audio = validateAudioInput(payload.audio || {});
        const { usd, credits } = await priceAudio(audio);
        if (await readBalance(pool, workspace.id) < credits) return Response.json({ error: 'Insufficient credits' }, { status: 402 });
        const file = await generateAudio(audio);
        const imported = await importAsset(workspace.id, {
          filename: `${audio.type}.mp3`, contentType: file.contentType, body: file.body, allowAudio: true,
        }, loadStorage(), pool);
        const assetId = imported.asset.id;
        const entry = {
          workspaceId: workspace.id, reason: `${source}_audio`, idempotencyKey: key,
          metadata: { type: audio.type, assetId, providerCostUsd: usd, characters: audio.type === 'voiceover' ? audio.text.length : undefined, durationSeconds: audio.durationSeconds },
        };
        let charged = credits;
        try {
          if (credits > 0) await appendCredit(pool, { ...entry, amount: -credits });
        } catch (error) {
          if (error?.message !== 'Insufficient credits') throw error;
          // Spent elsewhere while this was generating: take what is left, as for text.
          const balance = await readBalance(pool, workspace.id);
          charged = Math.max(0, Math.floor(balance * 10) / 10);
          if (charged > 0) await appendCredit(pool, { ...entry, amount: -charged, metadata: { ...entry.metadata, partial: true, quotedCredits: credits } });
        }
        return Response.json({ assetId, credits: charged }, { status: 201 });
      }

      // A user's video watched by a Seed vision model (the Director's video analyst), charged by the tokens used.
      // A retry with the same key returns the same text.
      if (action === 'analyze-video') {
        const { assetId, question, idempotencyKey } = payload;
        if (typeof assetId !== 'string' || !assetId) return badRequest('assetId is required');
        if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200) return badRequest('idempotencyKey is required');
        const key = `${source}-video-analysis:${idempotencyKey}`;
        const done = await findCreditEntry(pool, workspace.id, key);
        if (done?.metadata?.text) return Response.json({ text: done.metadata.text, credits: -Number(done.amount) });
        if (await readBalance(pool, workspace.id) <= 0) return Response.json({ error: 'Insufficient credits' }, { status: 402 });
        const storage = loadStorage();
        const found = await getDownload(workspace.id, assetId, storage);
        if (!found) return Response.json({ error: 'Asset not found' }, { status: 404 });
        if (!String(found.asset.content_type || '').startsWith('video/')) return badRequest('The asset is not a video');
        const inline = (body) => {
          if (body.length > MAX_INLINE_BYTES) throw Object.assign(new Error('Video is too large to analyse'), { status: 400 });
          return `data:${found.asset.content_type};base64,${Buffer.from(body).toString('base64')}`;
        };
        const target = found.download.url;
        let result;
        if (new URL(target).protocol === 'local:') {
          result = await watchVideo({ url: inline((await storage.get(target)).body), question });
        } else {
          try {
            result = await watchVideo({ url: target, question });
          } catch (error) {
            if (!error?.invalidUrl) throw error;
            result = await watchVideo({ url: inline(await fetchBytes(target)), question }); // the provider could not fetch it
          }
        }
        const { usd, credits } = await priceVideoAnalysis(result.usage);
        const entry = {
          workspaceId: workspace.id, reason: `${source}_video_analysis`, idempotencyKey: key,
          metadata: { assetId, text: result.text, usage: result.usage, providerCostUsd: usd },
        };
        let charged = credits;
        try {
          if (credits > 0) await appendCredit(pool, { ...entry, amount: -credits });
        } catch (error) {
          if (error?.message !== 'Insufficient credits') throw error;
          const balance = await readBalance(pool, workspace.id);
          charged = Math.max(0, Math.floor(balance * 10) / 10);
          if (charged > 0) await appendCredit(pool, { ...entry, amount: -charged, metadata: { ...entry.metadata, partial: true, quotedCredits: credits } });
        }
        return Response.json({ text: result.text, credits: charged });
      }

      if (action === 'import-asset') {
        const { filename, contentType, dataBase64 } = payload;
        if (typeof contentType !== 'string' || !contentType.startsWith('image/') || typeof dataBase64 !== 'string') return badRequest('An image is required');
        const bytes = Buffer.from(dataBase64, 'base64');
        if (!bytes.length || bytes.length > MAX_IMPORT_BYTES) return badRequest('Image size is invalid');
        const result = await importAsset(workspace.id, {
          filename: typeof filename === 'string' && filename.trim() ? filename : 'storyboard-reference',
          contentType,
          body: bytes,
        }, loadStorage(), pool);
        return Response.json({ assetId: result.asset.id, reference: `/api/assets/${encodeURIComponent(result.asset.id)}/download` }, { status: 201 });
      }

      if (action === 'download-asset') {
        if (typeof payload.assetId !== 'string' || !payload.assetId) return badRequest('assetId is required');
        const storage = loadStorage();
        const result = await getDownload(workspace.id, payload.assetId, storage);
        if (!result) return Response.json({ error: 'Asset not found' }, { status: 404 });
        const target = result.download.url;
        if (new URL(target).protocol === 'local:') {
          const object = await storage.get(target);
          return new Response(new Uint8Array(object.body), { headers: {
            'Content-Type': object.contentType || result.asset.content_type || 'application/octet-stream',
            'Content-Length': String(object.body.length),
            'Cache-Control': 'no-store',
          } });
        }
        return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
      }

      if (action === 'submit') {
        const input = payload.input;
        const kind = input?.kind;
        if (!STORYBOARD_MODELS[kind] || input.model !== STORYBOARD_MODELS[kind]) return badRequest('Unsupported storyboard model');
        if (typeof input.prompt !== 'string' || !input.prompt.trim()) return badRequest('A prompt is required');
        if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey) return badRequest('idempotencyKey is required');
        const generation = await reserve(pool, workspace.id, {
          kind,
          prompt: input.prompt,
          model: input.model,
          parameters: { ...(input.parameters || {}), source },
          idempotencyKey: `${source}:${input.idempotencyKey}`,
          projectId: null,
        }, { userId: body.userId });
        try {
          await publish({ pool, kind: generation.kind });
        } catch (error) {
          logError({ event: 'generation_publication_deferred', generationId: generation.id, errorName: error?.name || 'Error', errorCode: error?.code || null });
        }
        return Response.json({ generation: storyboardGeneration(toPublicGeneration(generation)) }, { status: 201 });
      }

      // status
      if (typeof payload.generationId !== 'string' || !payload.generationId) return badRequest('generationId is required');
      const generation = await getGeneration(workspace.id, payload.generationId);
      if (!generation) return Response.json({ error: 'Generation not found' }, { status: 404 });
      return Response.json({ generation: storyboardGeneration(toPublicGeneration(generation)) });
    } catch (error) {
      const insufficient = error?.message === 'Insufficient credits';
      const status = insufficient ? 402 : Number(error?.status) || 500;
      if (status >= 500) {
        logError({ event: 'internal_storyboard_request_failed', action, errorName: error?.name || 'Error', errorMessage: error?.message || 'Unknown error', errorCode: error?.code || null });
      }
      return Response.json({ error: insufficient ? 'Insufficient credits' : status >= 500 ? 'Storyboard request failed' : error.message, code: error?.code || null }, { status });
    }
  };
}

// Storage keys and download URLs stay server-side; Jellyfish fetches outputs
// through the signed download-asset action.
function storyboardGeneration(generation) {
  return {
    id: generation.id,
    kind: generation.kind,
    status: generation.status,
    error: generation.error ?? null,
    outputs: (generation.outputs || []).map((output) => ({ assetId: output.assetId, contentType: output.contentType || null })),
  };
}

export const POST = createInternalStoryboardHandler();
