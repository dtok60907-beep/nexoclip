import { randomUUID } from 'node:crypto';
import { createProviderRouter, markTrustedAssetRequest } from '../providers/providerRouter.js';
import { createGeneratedAsset } from '../repositories/assetMetadataRepository.js';
import {
  findBytePlusAssetLink as findStoredBytePlusAssetLink,
  markBytePlusAssetLinkStale as markStoredBytePlusAssetLinkStale,
} from '../repositories/byteplusAssetRepository.js';
import { isDirectBytePlusSeedance } from '../providers/providerRegistry.js';
import { resolveReferenceImages } from './saasImageGeneration.js';
import { recordGenerationProviderRequest } from '../repositories/generationStateRepository.js';
import { extraReferenceImages, isFrameTask } from './videoTaskType.js';

const TERMINAL_FAILURES = new Set(['failed', 'cancelled', 'expired']);

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

export function createSaasVideoHandler({ pool, storage, referenceStorage = storage, providerRouter, findBytePlusAssetLink = findStoredBytePlusAssetLink, markBytePlusAssetLinkStale = markStoredBytePlusAssetLinkStale, env = process.env, createAsset = createGeneratedAsset, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pollIntervalMs = 5_000, maxPolls = 120, recordProviderRequest = recordGenerationProviderRequest }) {
  if (!pool || !storage || !providerRouter) throw new TypeError('pool, storage, and provider router are required');
  const submitToProvider = async (job) => {
    let hasTrustedAsset = false;
    const trustedMappings = [];
    const projectName = env.BYTEPLUS_PROJECT_NAME?.trim() || 'default';
    const canvasProjectId = job.parameters?.canvasProjectId || 'workspace';
    const resolveWorkspaceAsset = isDirectBytePlusSeedance(job.model, env)
      ? async ({ workspaceId, assetId }) => {
        const link = await findBytePlusAssetLink(pool, workspaceId, assetId, canvasProjectId);
        if (!link) return null;
        if (link.project_name !== projectName) {
          throw Object.assign(new Error('Trusted BytePlus asset belongs to another project. Recreate Trust for Seedance.'), {
            code: 'BYTEPLUS_ASSET_PROJECT_MISMATCH', status: 422,
          });
        }
        if (link.status === 'active' && link.provider_asset_id?.trim()) {
          hasTrustedAsset = true;
          trustedMappings.push({
            workspaceId, localAssetId: assetId, canvasProjectId, providerAssetId: link.provider_asset_id.trim(),
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
    const resolution = { workspaceId: job.workspace_id, pool, storage, referenceStorage, resolveWorkspaceAsset };
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
    const referenceImages = await resolveReferenceImages({ ...resolution, referenceImages: frameTask ? extraReferenceImages(parameters) : parameters.referenceImages });
    const frameImages = await resolveReferenceImages({ ...resolution, referenceImages: keptFrames.map((frame) => frame.url) });
    const referenceVideos = await resolveReferenceImages({ workspaceId: job.workspace_id, referenceImages: parameters.referenceVideos, pool, storage, referenceStorage });
    const referenceAudios = await resolveReferenceImages({ workspaceId: job.workspace_id, referenceImages: parameters.referenceAudios, pool, storage, referenceStorage });
    const frameJob = { ...job, parameters: { ...parameters, frameImages: keptFrames } };
    const request = videoRequest(frameJob, { referenceImages, frameImages, referenceVideos, referenceAudios });
    if (frameTask) request.frameTask = true;
    let submitted;
    try {
      submitted = await providerRouter.submitVideo(hasTrustedAsset ? markTrustedAssetRequest(request) : request);
    } catch (error) {
      if (!error?.assetNotFound || trustedMappings.length === 0) throw error;
      await Promise.all(trustedMappings.map(mapping => markBytePlusAssetLinkStale(pool, {
        ...mapping, errorCode: 'BYTEPLUS_ASSET_NOT_FOUND',
      })));
      throw Object.assign(new Error('Trusted BytePlus asset is missing. Trust this asset again before generating.'), {
        code: 'BYTEPLUS_ASSET_STALE', status: 422,
      });
    }
    const provider = submitted.provider || 'openrouter';
    const providerRequestId = submitted.id || submitted.providerRequestId;
    if (!providerRequestId) throw Object.assign(new Error('Provider returned no video request id'), { code: 'PROVIDER_INVALID_RESPONSE' });
    return { provider, providerRequestId, usage: submitted.usage || {} };
  };

  return async (job) => {
    // A job that already reached the provider (its worker died mid-poll, e.g.
    // during a deploy) resumes polling that same task instead of submitting
    // and paying for the generation again.
    const resumed = job.provider_request_id
      ? { provider: job.provider || 'byteplus', providerRequestId: job.provider_request_id, usage: {} }
      : null;
    const { provider, providerRequestId, usage } = resumed || await submitToProvider(job);
    if (!resumed && job.claim_token) {
      try {
        await recordProviderRequest(pool, { generationId: job.id, claimToken: job.claim_token, provider, providerRequestId });
      } catch (error) {
        console.error('[video] could not record provider request id', job.id, error?.message);
      }
    }
    let status;
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      status = await providerRouter.pollVideo(provider, providerRequestId);
      if (status?.status === 'completed') break;
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
      // BytePlus reports the billed tokens on the finished task.
      return { status: 'succeeded', provider, providerRequestId, outputs: [{ assetId: asset.id }], usage: { ...usage, ...(status?.usage && typeof status.usage === 'object' ? status.usage : {}) } };
    } finally { client.release(); }
  };
}

export function createDefaultSaasVideoHandler({ pool, storage, referenceStorage = storage, providerRouter = createProviderRouter(), findBytePlusAssetLink = findStoredBytePlusAssetLink, env = process.env }) {
  return createSaasVideoHandler({ pool, storage, referenceStorage, providerRouter, findBytePlusAssetLink, env });
}
