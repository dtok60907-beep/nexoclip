import { createHash, randomUUID } from 'node:crypto';
import { createProviderRouter, markTrustedAssetRequest } from '../providers/providerRouter.js';
import { createGeneratedAsset } from '../repositories/assetMetadataRepository.js';
import {
  findBytePlusAssetLink as findStoredBytePlusAssetLink,
  markBytePlusAssetLinkStale as markStoredBytePlusAssetLinkStale,
} from '../repositories/byteplusAssetRepository.js';
import { isDirectBytePlusSeedance } from '../providers/providerRegistry.js';
import { legacyR2Key, resolveReferenceImages, resolveReferenceMedia } from './saasImageGeneration.js';
import { recordGenerationProviderRequest } from '../repositories/generationStateRepository.js';
import { extraReferenceImages, isFrameTask } from './videoTaskType.js';
import { createSeedanceAutoTrust, realPersonContentIndexes } from './seedanceAutoTrust.js';

const TERMINAL_FAILURES = new Set(['failed', 'cancelled', 'expired']);
// How many times one generation trusts what Seedance refused (or lost) and sends again.
const TRUST_ROUNDS = 3;

function videoRequest(job, { referenceImages, frameImages, referenceVideos, referenceAudios = [] }) {
  const parameters = job.parameters || {};
  const framed = frameImages.map((url, index) => ({
    type: 'image_url', image_url: { url }, frame_type: parameters.frameImages[index].frameType,
  }));
  return {
    model: job.model, prompt: job.prompt,
    ...(parameters.duration !== undefined ? { duration: Number(parameters.duration) } : {}),
    ...(parameters.resolution ? { resolution: parameters.resolution } : {}),
    ...(parameters.aspectRatio ? { aspectRatio: parameters.aspectRatio } : {}),
    ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
    ...(parameters.draft !== undefined ? { draft: Boolean(parameters.draft) } : {}),
    ...(parameters.outputFormat ? { outputFormat: parameters.outputFormat } : {}),
    ...(parameters.generateAudio !== undefined ? { generateAudio: Boolean(parameters.generateAudio) } : {}),
    ...(parameters.watermark !== undefined ? { watermark: Boolean(parameters.watermark) } : {}),
    ...(parameters.returnLastFrame ? { returnLastFrame: true } : {}),
    ...(parameters.omniReferenceTaskType ? { omniReferenceTaskType: parameters.omniReferenceTaskType } : {}),
    ...(framed.length ? { frameImages: framed } : {}),
    ...(referenceImages.length ? { referenceImages } : {}),
    ...(referenceVideos.length ? { referenceVideos } : {}),
    ...(referenceAudios.length ? { referenceAudios } : {}),
  };
}

// Seedance 2.5 decides the task type from the prompt after the job starts and
// fails it asynchronously when that type does not match the request.
const TASK_TYPE_HINTS = {
  'InvalidParameter.TaskTypeMismatch': 'Seedance read the prompt as a different task than the selected mode. Match the mode to the prompt (Edit: "add / remove / replace …", Extend: "extend / continue …") or turn the mode off.',
  'InvalidParameter.TaskTypeConstraint': 'Seedance read this as an edit, extend, or first-frame task, which needs adaptive aspect ratio (and auto duration for edit, with a 4–30s source video). Switch on the matching mode or set those values.',
};

function providerFailure(status) {
  const code = typeof status?.error_code === 'string' ? status.error_code : (typeof status?.error?.code === 'string' ? status.error.code : null);
  const detail = typeof status?.error === 'string' ? status.error : (typeof status?.error?.message === 'string' ? status.error.message : null);
  const hint = code && TASK_TYPE_HINTS[code];
  // `publicMessage` reaches the browser; the raw provider detail stays in logs.
  return Object.assign(new Error(`Video provider generation failed${code ? ` (${code})` : ''}${detail ? `: ${detail}` : ''}`), {
    code: 'PROVIDER_GENERATION_FAILED', providerErrorCode: code, ...(hint ? { publicMessage: `${hint} (${code})` } : {}),
  });
}

// Seedance refuses reference images under 90,000 pixels or 300 px on a side (a 350×233
// thumbnail failed this way). Enlarge those instead of failing the job.
const SEEDANCE_MIN_PIXELS = 90_000;
const SEEDANCE_MIN_SIDE = 300;

export async function enlargeSmallReference(body, contentType) {
  if (!/^image\//i.test(contentType || '')) return null;
  try {
    const { default: sharp } = await import('sharp');
    const { width, height } = await sharp(body).metadata();
    if (!width || !height) return null;
    const scale = Math.max(Math.sqrt(SEEDANCE_MIN_PIXELS / (width * height)), SEEDANCE_MIN_SIDE / Math.min(width, height));
    if (scale <= 1) return null;
    const enlarged = await sharp(body).resize(Math.ceil(width * scale), Math.ceil(height * scale)).png().toBuffer();
    return `data:image/png;base64,${enlarged.toString('base64')}`;
  } catch {
    return null; // not a readable image: send it as it is and let the provider judge
  }
}

// A photo uploaded straight onto a Canvas board lives in Canvas storage
// (/canvas/api/r2-image/<key>), not in the workspace's assets, so it cannot be trusted on
// BytePlus. When Seedance refuses one as a real person it is copied into the workspace once
// (as the Director does with uploaded photos) and that asset is trusted instead. The copy is
// keyed by the Canvas object, so later generations with the same photo reuse it.
// `create: false` only finds an earlier copy.
export async function adoptCanvasReference({ pool, storage, referenceStorage = storage, workspaceId, reference, create = true }) {
  const key = legacyR2Key(reference);
  if (!key) return null;
  const storageKey = `${workspaceId}/canvas-reference/${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  const existing = await pool.query('SELECT id FROM assets WHERE workspace_id = $1 AND storage_key = $2 LIMIT 1', [workspaceId, storageKey]);
  if (existing.rows[0]?.id || !create) return existing.rows[0]?.id || null;
  const download = await referenceStorage.createDownloadUrl({ key });
  const object = await referenceStorage.get(download.url || download);
  const body = Buffer.from(object.body);
  const contentType = object.contentType || 'image/png';
  if (typeof storage.createUploadUrl === 'function') {
    const upload = await storage.createUploadUrl({ key: storageKey, contentType });
    await storage.put(upload.url || upload, body, contentType);
  } else {
    await storage.put(storageKey, body, contentType);
  }
  const client = await pool.connect();
  try {
    const filename = `canvas-${key.split('/').pop() || 'reference'}`.slice(0, 200);
    return (await createGeneratedAsset(client, { workspaceId, storageKey, filename, contentType, sizeBytes: body.length })).id;
  } finally { client.release(); }
}

const assetIdOf = (url) => (typeof url === 'string' ? url.match(/^\/api\/assets\/([^/]+)\/download(?:\?|$)/)?.[1] : null) || null;

// BytePlus explains a refused request ("... must be greater than or equal to 90000 ..."). Show
// that to the user without the request id; other provider failures stay generic.
function seedanceRejection(error) {
  const detail = String(error?.message || '').replace(/^BytePlus direct request failed:?\s*/, '').replace(/\s*Request id:.*$/s, '').trim();
  if (error?.code !== 'BYTEPLUS_REQUEST_FAILED' || error?.status !== 400 || !detail) return error;
  const realPerson = realPersonContentIndexes(error);
  const publicMessage = realPerson
    ? `Seedance refused reference image ${realPerson.join(', ')} as showing a real person, and it could not be cleared automatically. Try again, or use a different image.`
    : `Seedance rejected the request: ${detail}`;
  return Object.assign(error, { publicMessage });
}

export function createSaasVideoHandler({ pool, storage, referenceStorage = storage, providerRouter, findBytePlusAssetLink = findStoredBytePlusAssetLink, markBytePlusAssetLinkStale = markStoredBytePlusAssetLinkStale, env = process.env, createAsset = createGeneratedAsset, fetch: fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pollIntervalMs = 5_000, maxPolls = 120, recordProviderRequest = recordGenerationProviderRequest, onProviderUsage = null, autoTrust = null, adoptReference = adoptCanvasReference }) {
  if (!pool || !storage || !providerRouter) throw new TypeError('pool, storage, and provider router are required');
  const buildRequest = async (job) => {
    let hasTrustedAsset = false;
    const trustedMappings = [];
    const projectName = env.BYTEPLUS_PROJECT_NAME?.trim() || 'default';
    const canvasProjectId = job.parameters?.canvasProjectId || 'workspace';
    const seedance = isDirectBytePlusSeedance(job.model, env);
    // A Canvas job uses its project's trust first, then the workspace trust auto trust creates.
    const findLink = async (workspaceId, assetId) => {
      const link = await findBytePlusAssetLink(pool, workspaceId, assetId, canvasProjectId);
      if (canvasProjectId === 'workspace' || (link?.status === 'active' && link.provider_asset_id?.trim())) return { link, scope: canvasProjectId };
      const shared = await findBytePlusAssetLink(pool, workspaceId, assetId, 'workspace');
      return shared?.status === 'active' ? { link: shared, scope: 'workspace' } : { link, scope: canvasProjectId };
    };
    const resolveWorkspaceAsset = seedance
      ? async ({ workspaceId, assetId }) => {
        const { link, scope } = await findLink(workspaceId, assetId);
        if (!link) return null;
        if (link.project_name !== projectName) {
          throw Object.assign(new Error('Trusted BytePlus asset belongs to another project. Recreate Trust for Seedance.'), {
            code: 'BYTEPLUS_ASSET_PROJECT_MISMATCH', status: 422,
          });
        }
        if (link.status === 'active' && link.provider_asset_id?.trim()) {
          hasTrustedAsset = true;
          trustedMappings.push({
            workspaceId, localAssetId: assetId, canvasProjectId: scope, providerAssetId: link.provider_asset_id.trim(),
            attemptId: link.attempt_id,
          });
          return `asset://${link.provider_asset_id.trim()}`;
        }
        // The selected asset is only sent as a BytePlus asset when its own
        // Trust record is active. Processing, failed, and untrusted assets
        // deliberately fall through to raw image resolution.
        return null;
      }
      : undefined;
    const resolveWorkspaceAssetContent = seedance ? ({ body, contentType }) => enlargeSmallReference(body, contentType) : undefined;
    const resolution = { workspaceId: job.workspace_id, pool, storage, referenceStorage, resolveWorkspaceAsset, resolveWorkspaceAssetContent };
    const parameters = job.parameters || {};
    // A first/last-frame task sends the wired frames with their frame roles and
    // nothing else. Otherwise every image is an omni reference: Canvas already
    // lists the wired first frame as reference image 1 (the prompt's numbering
    // relies on it), so that frame is not sent a second time.
    const frameTask = isFrameTask(parameters);
    const referencedUrls = new Set(parameters.referenceImages || []);
    const keptFrames = frameTask
      ? parameters.frameImages
      : (parameters.frameImages || []).filter((frame) => !referencedUrls.has(frame.url));
    const referenceUrls = (frameTask ? extraReferenceImages(parameters) : parameters.referenceImages) || [];
    const frameUrls = keptFrames.map((frame) => frame.url);
    const referenceImages = await resolveReferenceImages({ ...resolution, referenceImages: referenceUrls });
    const frameImages = await resolveReferenceImages({ ...resolution, referenceImages: frameUrls });
    const referenceVideos = await resolveReferenceMedia({ workspaceId: job.workspace_id, references: parameters.referenceVideos, kind: 'video', pool, storage, referenceStorage });
    const referenceAudios = await resolveReferenceMedia({ workspaceId: job.workspace_id, references: parameters.referenceAudios, kind: 'audio', pool, storage, referenceStorage });
    const frameJob = { ...job, parameters: { ...parameters, frameImages: keptFrames } };
    const request = videoRequest(frameJob, { referenceImages, frameImages, referenceVideos, referenceAudios });
    if (frameTask) request.frameTask = true;
    // BytePlus numbers the request content: [0] is the prompt, then reference images, then frames.
    const imageUrls = [...referenceUrls, ...frameUrls];
    const imageAssetIds = imageUrls.map(assetIdOf);
    return { request: hasTrustedAsset ? markTrustedAssetRequest(request) : request, trustedMappings, imageUrls, imageAssetIds, seedance };
  };

  const submitToProvider = async (originalJob, observe) => {
    let job = originalJob;
    let built = await buildRequest(job);
    const trust = built.seedance ? autoTrust : null;
    const workspaceId = job.workspace_id;
    const borrowTrust = async (assetIds) => {
      const failed = await trust.borrow({ generationId: job.id, workspaceId, assetIds });
      built = await buildRequest(job);
      return failed;
    };
    // Sends Canvas uploads as their workspace copies from now on (see adoptCanvasReference).
    const adopt = async (urls, create) => {
      const swaps = new Map();
      for (const url of new Set(urls)) {
        if (assetIdOf(url) || !legacyR2Key(url)) continue;
        try {
          const assetId = await adoptReference({ pool, storage, referenceStorage, workspaceId, reference: url, create });
          if (assetId) swaps.set(url, `/api/assets/${assetId}/download`);
        } catch (error) {
          console.error('[seedance-trust] could not copy a Canvas reference', job.id, error?.message);
        }
      }
      if (!swaps.size) return;
      const swap = (url) => swaps.get(url) || url;
      const parameters = job.parameters || {};
      job = { ...job, parameters: {
        ...parameters,
        ...(parameters.referenceImages ? { referenceImages: parameters.referenceImages.map(swap) } : {}),
        ...(parameters.frameImages ? { frameImages: parameters.frameImages.map((frame) => ({ ...frame, url: swap(frame.url) })) } : {}),
      } };
      built = await buildRequest(job);
    };
    // A Canvas upload copied after an earlier refusal goes as that copy, so it is trusted up front.
    if (trust) await adopt(built.imageUrls, false);
    // Images trusted for this generation (a refusal of one of them is not retried).
    const trustedHere = new Set();
    let lostHere = false;
    // Images Seedance refused before are trusted up front instead of failing first.
    if (trust) {
      const known = await trust.flagged(workspaceId, built.imageAssetIds.filter(Boolean));
      if (known.length) {
        const failed = await borrowTrust(known);
        known.filter((id) => !failed.includes(id)).forEach((id) => trustedHere.add(id));
      }
    }
    let submitted;
    for (let round = 0; ; round += 1) {
      try {
        submitted = await providerRouter.submitVideo(built.request, observe ? { onProviderUsage: observe } : undefined);
        break;
      } catch (error) {
        // A trusted image goes to Seedance as asset://, which it never refuses as a real
        // person. So trust whatever it refuses (it may name other images on the next try,
        // up to TRUST_ROUNDS times) and send again.
        const canTrust = trust && round < TRUST_ROUNDS;
        const refused = realPersonContentIndexes(error);
        if (canTrust && refused) await adopt(refused.map((index) => built.imageUrls[index - 1]).filter(Boolean), true);
        const refusedIds = refused?.map((index) => built.imageAssetIds[index - 1]);
        // Only images this generation has not trusted yet: one refused again after its trust
        // is not a trust problem, and sending it again would only be refused again.
        const assetIds = refusedIds?.every(Boolean) ? [...new Set(refusedIds)].filter((id) => !trustedHere.has(id)) : null;
        if (canTrust && assetIds?.length) {
          assetIds.forEach((id) => trustedHere.add(id));
          console.info('[seedance-trust] trusting refused references', JSON.stringify({ generationId: job.id, round: round + 1, assetIds }));
          await trust.markNeedsTrust(workspaceId, assetIds);
          const failed = await borrowTrust(assetIds);
          if (!failed.length) continue;
        }
        if (!error?.assetNotFound || built.trustedMappings.length === 0) throw seedanceRejection(error);
        // A trusted asset is gone on BytePlus (its group was deleted, say): forget it and,
        // with auto trust, trust those images again instead of failing the generation.
        await markMissingAssets(built.trustedMappings);
        const missing = [...new Set(built.trustedMappings.map((mapping) => mapping.localAssetId))];
        if (canTrust && !lostHere) {
          lostHere = true;
          console.info('[seedance-trust] re-trusting missing assets', JSON.stringify({ generationId: job.id, round: round + 1, assetIds: missing }));
          const failed = await borrowTrust(missing);
          if (!failed.length) continue;
        }
        throw staleAssetError();
      }
    }
    const provider = submitted.provider || 'openrouter';
    const providerRequestId = submitted.id || submitted.providerRequestId;
    if (!providerRequestId) throw Object.assign(new Error('Provider returned no video request id'), { code: 'PROVIDER_INVALID_RESPONSE' });
    return { provider, providerRequestId, usage: submitted.usage || {} };
  };

  const markMissingAssets = (trustedMappings) => Promise.all(trustedMappings.map(mapping => markBytePlusAssetLinkStale(pool, {
    ...mapping, errorCode: 'BYTEPLUS_ASSET_NOT_FOUND',
  })));
  const staleAssetError = () => Object.assign(new Error('Trusted BytePlus asset is missing. Trust this asset again before generating.'), {
    code: 'BYTEPLUS_ASSET_STALE', status: 422,
  });

  // The last frame is a bonus output: a failure here is logged and the video
  // still succeeds.
  const saveLastFrame = async (job, status, client) => {
    const url = status?.content?.last_frame_url;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type')?.startsWith('image/') ? response.headers.get('content-type') : 'image/png';
      const key = `${job.workspace_id}/${randomUUID()}`;
      if (typeof storage.createUploadUrl === 'function') {
        const upload = await storage.createUploadUrl({ key, contentType });
        await storage.put(upload.url || upload, buffer, contentType);
      } else {
        await storage.put(key, buffer, contentType);
      }
      return await createAsset(client, { workspaceId: job.workspace_id, storageKey: key, filename: `generation-${job.id}-last-frame.png`, contentType, sizeBytes: buffer.length });
    } catch (error) {
      console.error('[video] could not save last frame', job.id, error?.message);
      return null;
    }
  };

  const runJob = async (job, _message, context = {}) => {
    const observer = context.onProviderUsage || onProviderUsage;
    let latestObservation = null;
    const observe = observer ? async (observation) => {
      latestObservation = observation;
      return observer(observation);
    } : null;
    // A job that already reached the provider (its worker died mid-poll, e.g.
    // during a deploy) resumes polling that same task instead of submitting
    // and paying for the generation again.
    const resumed = job.provider_request_id
      ? { provider: job.provider || 'byteplus', providerRequestId: job.provider_request_id, usage: {} }
      : null;
    const { provider, providerRequestId, usage } = resumed || await submitToProvider(job, observe);
    const dispatchId = latestObservation?.dispatchId || randomUUID();
    let observedUsage = usage;
    const observeRequest = observe ? (eventType) => observe({ provider, providerRequestId, dispatchId, eventType, usage: observedUsage }) : null;
    if (observeRequest) await observeRequest('submitted');
    if (!resumed && job.claim_token) {
      try {
        await recordProviderRequest(pool, { generationId: job.id, claimToken: job.claim_token, provider, providerRequestId });
      } catch (error) {
        console.error('[video] could not record provider request id', job.id, error?.message);
      }
    }
    let status;
    let completedAtProvider = false;
    let terminalAtProvider = false;
    try {
      for (let attempt = 0; attempt < maxPolls; attempt += 1) {
        status = await providerRouter.pollVideo(provider, providerRequestId);
        if (status?.usage && typeof status.usage === 'object') observedUsage = { ...observedUsage, ...status.usage };
        if (status?.status === 'completed') {
          completedAtProvider = true;
          terminalAtProvider = true;
          if (observeRequest) await observeRequest('succeeded');
          break;
        }
        if (TERMINAL_FAILURES.has(status?.status)) terminalAtProvider = true;
        if (observeRequest) await observeRequest(terminalAtProvider ? 'failed' : 'poll');
        if (TERMINAL_FAILURES.has(status?.status)) throw providerFailure(status);
        await sleep(pollIntervalMs);
      }
      if (status?.status !== 'completed') throw Object.assign(new Error('Video provider generation timed out'), { code: 'GENERATION_TIMEOUT' });
      const output = await providerRouter.downloadVideo(provider, providerRequestId, 0);
      const key = `${job.workspace_id}/${randomUUID()}`;
      const contentType = output.contentType || 'video/mp4';
      if (typeof storage.createUploadUrl === 'function') {
        const upload = await storage.createUploadUrl({ key, contentType });
        await storage.put(upload.url || upload, output.buffer, contentType);
      } else {
        await storage.put(key, output.buffer, contentType);
      }
      const client = await pool.connect();
      try {
        const asset = await createAsset(client, { workspaceId: job.workspace_id, storageKey: key, filename: `generation-${job.id}.mp4`, contentType, sizeBytes: output.buffer.length });
        const outputs = [{ assetId: asset.id }];
        // Output 2: the last frame, kept so the next shot can start from it.
        const lastFrame = job.parameters?.returnLastFrame ? await saveLastFrame(job, status, client) : null;
        if (lastFrame) outputs.push({ assetId: lastFrame.id });
        // BytePlus reports the billed tokens on the finished task.
        return { status: 'succeeded', provider, providerRequestId, outputs, usage: observedUsage };
      } finally { client.release(); }
    } catch (error) {
      if (error?.usage && typeof error.usage === 'object') observedUsage = { ...observedUsage, ...error.usage };
      if (observeRequest) await observeRequest(error?.code === 'GENERATION_TIMEOUT' ? 'timeout'
        : (completedAtProvider ? 'output_failed' : (terminalAtProvider ? 'failed' : 'interrupted')));
      throw error;
    }
  };

  if (!autoTrust) return runJob;
  // Trusts borrowed for this job are given back however it ends; a worker that dies
  // leaves them to the worker's sweep.
  return async (job, message, context) => {
    try {
      return await runJob(job, message, context);
    } finally {
      await autoTrust.release(job.id).catch((error) => console.error('[seedance-trust] release failed', job.id, error?.message));
    }
  };
}

export function createDefaultSaasVideoHandler({ pool, storage, referenceStorage = storage, providerRouter = createProviderRouter(), findBytePlusAssetLink = findStoredBytePlusAssetLink, env = process.env, maxPolls, pollIntervalMs, onProviderUsage = null, autoTrust = createSeedanceAutoTrust({ pool }) }) {
  return createSaasVideoHandler({ pool, storage, referenceStorage, providerRouter, findBytePlusAssetLink, env, onProviderUsage, autoTrust, ...(maxPolls ? { maxPolls } : {}), ...(pollIntervalMs ? { pollIntervalMs } : {}) });
}
