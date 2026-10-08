import { randomUUID } from 'node:crypto';
import { createProviderRouter } from '../providers/providerRouter.js';
import { createGeneratedAsset } from '../repositories/assetMetadataRepository.js';

function dataUrl(body, contentType) {
  return `data:${contentType};base64,${Buffer.from(body).toString('base64')}`;
}

function legacyR2Key(reference) {
  try {
    const path = new URL(reference, 'https://canvas.invalid').pathname;
    const marker = '/api/r2-image/';
    const index = path.indexOf(marker);
    return index === -1 ? null : decodeURIComponent(path.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function resolveReferenceImages({ workspaceId, referenceImages, pool, storage, referenceStorage = storage, resolveWorkspaceAsset, resolveWorkspaceAssetContent }) {
  if (!referenceImages?.length) return [];
  return Promise.all(referenceImages.map(async (reference) => {
    if (typeof reference !== 'string' || /^\s*asset:\/\//i.test(reference)) throw Object.assign(new Error('Invalid asset reference'), { code: 'INVALID_REFERENCE_IMAGE' });

    // Legacy Spite folders retain /spite/api/r2-image/<key> URLs. They are
    // browser proxy paths, not provider-fetchable URLs. Read the object with
    // worker storage and inline it, just as canonical workspace assets do.
    const legacyKey = legacyR2Key(reference);
    if (legacyKey) {
      const download = await referenceStorage.createDownloadUrl({ key: legacyKey });
      const object = await referenceStorage.get(download.url || download);
      return dataUrl(object.body, object.contentType || 'application/octet-stream');
    }

    if (!reference.startsWith('/api/assets/')) return reference;
    const assetId = reference.match(/^\/api\/assets\/([^/]+)\/download(?:\?|$)/)?.[1];
    if (!assetId) throw Object.assign(new Error('Invalid asset reference'), { code: 'INVALID_REFERENCE_IMAGE' });
    const result = await pool.query(
      'SELECT storage_key, content_type FROM assets WHERE workspace_id = $1 AND id = $2 LIMIT 1',
      [workspaceId, assetId],
    );
    const asset = result.rows[0];
    if (!asset) throw Object.assign(new Error('Reference asset not found'), { code: 'REFERENCE_ASSET_NOT_FOUND' });
    const resolved = await resolveWorkspaceAsset?.({ workspaceId, assetId, asset });
    if (resolved) return resolved;
    const download = await storage.createDownloadUrl({ key: asset.storage_key });
    const object = await storage.get(download.url || download);
    const resolvedByContent = await resolveWorkspaceAssetContent?.({
      workspaceId, assetId, asset, body: object.body,
      contentType: object.contentType || asset.content_type,
    });
    if (resolvedByContent) return resolvedByContent;
    return dataUrl(object.body, object.contentType || asset.content_type);
  }));
}

// Seedance only takes reference videos as URLs (or BytePlus asset ids), not
// base64, and inlining a 200MB clip would blow the 64MB request limit. Hand the
// provider a short-lived pre-signed HTTPS URL instead. Audio may fall back to
// base64 when storage cannot sign a public URL (local development storage).
const MEDIA_URL_TTL_SECONDS = 24 * 60 * 60;

function mediaUnavailableError() {
  return Object.assign(new Error('Reference video storage cannot produce a public URL'), {
    code: 'REFERENCE_MEDIA_NOT_PUBLIC',
    publicMessage: 'Reference videos need public object storage (R2) so Seedance can download them. This environment stores assets locally.',
  });
}

async function signedHttpsUrl(storage, key) {
  try {
    const download = await storage.createDownloadUrl({ key, expiresInSeconds: MEDIA_URL_TTL_SECONDS });
    const url = download?.url || download;
    return typeof url === 'string' && new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export async function resolveReferenceMedia({ workspaceId, references, kind, pool, storage, referenceStorage = storage }) {
  if (!references?.length) return [];
  return Promise.all(references.map(async (reference) => {
    if (typeof reference !== 'string' || /^\s*asset:\/\//i.test(reference)) throw Object.assign(new Error('Invalid asset reference'), { code: 'INVALID_REFERENCE_IMAGE' });
    if (/^https:\/\//i.test(reference)) return reference;
    const legacyKey = legacyR2Key(reference);
    let url = null;
    if (legacyKey) {
      url = await signedHttpsUrl(referenceStorage, legacyKey);
    } else {
      const assetId = reference.match(/^\/api\/assets\/([^/]+)\/download(?:\?|$)/)?.[1];
      if (!assetId) throw Object.assign(new Error('Invalid asset reference'), { code: 'INVALID_REFERENCE_IMAGE' });
      const result = await pool.query(
        'SELECT storage_key, content_type FROM assets WHERE workspace_id = $1 AND id = $2 LIMIT 1',
        [workspaceId, assetId],
      );
      const asset = result.rows[0];
      if (!asset) throw Object.assign(new Error('Reference asset not found'), { code: 'REFERENCE_ASSET_NOT_FOUND' });
      url = await signedHttpsUrl(storage, asset.storage_key);
    }
    if (url) return url;
    if (kind === 'video') throw mediaUnavailableError();
    const [inline] = await resolveReferenceImages({ workspaceId, referenceImages: [reference], pool, storage, referenceStorage });
    return inline;
  }));
}

function imageRequest(job, referenceImages) {
  const parameters = job.parameters || {};
  return {
    model: job.model,
    prompt: job.prompt,
    ...(parameters.aspectRatio ? { aspectRatio: parameters.aspectRatio } : {}),
    ...(parameters.resolution ? { resolution: parameters.resolution } : {}),
    ...(parameters.quality ? { quality: parameters.quality } : {}),
    ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
    ...(referenceImages?.length ? { referenceImages } : {}),
  };
}

async function downloadOutput(output) {
  const url = typeof output === 'string' ? output : output?.url;
  if (!url) throw Object.assign(new Error('Provider returned an invalid image output'), { code: 'PROVIDER_INVALID_RESPONSE' });
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)?;base64,(.+)$/);
    if (!match) throw Object.assign(new Error('Provider returned an invalid data image'), { code: 'PROVIDER_INVALID_RESPONSE' });
    return { body: Buffer.from(match[2], 'base64'), contentType: match[1] || output?.mimeType || 'image/png' };
  }
  const response = await fetch(url);
  if (!response.ok) throw Object.assign(new Error('Provider output download failed'), { code: 'PROVIDER_OUTPUT_UNAVAILABLE' });
  return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || output?.mimeType || 'image/png' };
}

export function createSaasImageHandler({ providerRouter, provider, storage, referenceStorage = storage, pool, onProviderUsage = null }) {
  if ((!providerRouter && !provider) || !storage || !pool) throw new TypeError('provider router, storage, and pool are required');
  return async (job, _message, context = {}) => {
    const observer = context.onProviderUsage || onProviderUsage;
    let latestObservation = null;
    const observe = observer ? async (observation) => {
      latestObservation = observation;
      return observer(observation);
    } : null;
    const referenceImages = await resolveReferenceImages({
      workspaceId: job.workspace_id,
      referenceImages: job.parameters?.referenceImages,
      pool,
      storage,
      referenceStorage,
    });
    const dispatchId = randomUUID();
    if (!providerRouter && observe) await observe({ provider: 'muapi', dispatchId, eventType: 'dispatch', usage: {} });
    const result = providerRouter
      ? await providerRouter.generateImage(imageRequest(job, referenceImages), observe ? { onProviderUsage: observe } : undefined)
      : await provider.submitGeneration({ model: job.model, payload: { prompt: job.prompt, ...(job.parameters || {}) } });
    const providerCostObservation = {
      provider: result.provider || 'muapi', dispatchId: latestObservation?.dispatchId || dispatchId,
      providerRequestId: result.providerRequestId || null, usage: result.usage || {},
    };
    // Save the provider charge before downloading or persisting its output.
    if (observe) await observe({ ...providerCostObservation, eventType: 'succeeded' });
    const providerRequestId = result.providerRequestId || `${result.provider || 'provider'}:${job.id}`;
    const savedOutputs = [];
    try {
      for (const [index, output] of (result.outputs || []).entries()) {
        const { body, contentType } = await downloadOutput(output);
        const key = `${job.workspace_id}/${randomUUID()}`;
        if (typeof storage.createUploadUrl === 'function') {
          const upload = await storage.createUploadUrl({ key, contentType });
          await storage.put(upload.url || upload, body, contentType);
        } else {
          await storage.put(key, body, contentType);
        }
        const client = await pool.connect();
        try {
          const asset = await createGeneratedAsset(client, {
            workspaceId: job.workspace_id, storageKey: key, filename: `generation-${job.id}-${index}.png`, contentType, sizeBytes: body.length,
          });
          savedOutputs.push({ assetId: asset.id });
        } finally { client.release(); }
      }
      if (!savedOutputs.length) throw Object.assign(new Error('Provider returned no image outputs'), { code: 'PROVIDER_INVALID_RESPONSE' });
      return { status: 'succeeded', provider: result.provider || 'muapi', providerRequestId, outputs: savedOutputs, usage: result.usage || {} };
    } catch (error) {
      if (observe) await observe({ ...providerCostObservation, eventType: 'output_failed' });
      throw error;
    }
  };
}

export function createDefaultSaasImageHandler({ pool, storage, referenceStorage = storage, providerRouter = createProviderRouter(), onProviderUsage = null }) {
  return createSaasImageHandler({ pool, storage, referenceStorage, providerRouter, onProviderUsage });
}
