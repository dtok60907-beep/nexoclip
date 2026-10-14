import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { LocalObjectStorage } from '../storage/localObjectStorage.js';
import { R2ObjectStorage } from '../storage/r2ObjectStorage.js';
import { listAssets } from '../repositories/assetMetadataRepository.js';
import { ensureAssetThumbnail } from './assetThumbnailService.js';

const allowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav']);
const maxSizeBytes = 50 * 1024 * 1024;

export function validateAssetInput(input, { maxBytes = maxSizeBytes } = {}) {
  const filename = String(input?.filename || '').trim();
  const contentType = String(input?.contentType || '').trim().toLowerCase();
  const sizeBytes = Number(input?.sizeBytes);
  if (!filename) throw new Error('Asset filename is required');
  if (!allowedContentTypes.has(contentType)) throw new Error('Asset content type is not supported');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxBytes) throw new Error('Asset size is invalid');
  return { filename, contentType, sizeBytes };
}

export function createStorage(env = process.env) {
  if (env.R2_BUCKET && env.R2_PUBLIC_URL && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new R2ObjectStorage({
      bucket: env.R2_BUCKET,
      publicUrl: env.R2_PUBLIC_URL,
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }
  return new LocalObjectStorage({
    root: env.LOCAL_OBJECT_STORAGE_DIR || '.local-object-storage',
    secret: env.LOCAL_OBJECT_STORAGE_SECRET || 'development-only-change-me',
  });
}

// Canvas folders can still contain legacy Spite proxy URLs whose objects live
// in Spite's R2 bucket. Main generation outputs may remain on local storage,
// so references need an independent reader instead of changing output storage.
export function createReferenceStorage(env = process.env, fallback = createStorage(env)) {
  if (env.R2_BUCKET_NAME && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new R2ObjectStorage({
      bucket: env.R2_BUCKET_NAME,
      publicUrl: env.R2_PUBLIC_URL || 'https://legacy-reference.invalid',
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }
  return fallback;
}

export async function findExactTrustedWorkspaceAsset({
  workspaceId, body, contentType, excludeAssetId = null, projectName = process.env.BYTEPLUS_PROJECT_NAME?.trim() || 'default',
}, storage = createStorage(), pool = getPool()) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  const result = await pool.query(
    `SELECT a.id, a.workspace_id, a.storage_key, a.filename, a.content_type, a.size_bytes,
            l.provider_asset_id, l.group_id, l.project_name
     FROM assets a
     JOIN byteplus_asset_links l
       ON l.workspace_id = a.workspace_id AND l.local_asset_id = a.id
     WHERE a.workspace_id = $1 AND a.size_bytes = $2 AND a.content_type = $3
       AND l.status = 'active' AND l.provider_asset_id IS NOT NULL
       AND l.project_name = $4
       AND ($5::uuid IS NULL OR a.id <> $5)
     ORDER BY l.updated_at DESC`,
    [workspaceId, bytes.length, contentType, projectName, excludeAssetId],
  );
  for (const candidate of result.rows) {
    try {
      const download = await storage.createDownloadUrl({ key: candidate.storage_key });
      const object = await storage.get(download.url || download);
      if (bytes.equals(Buffer.from(object.body))) return candidate;
    } catch {
      // A stale candidate must not prevent importing or resolving this image.
    }
  }
  return null;
}

export async function importWorkspaceAsset(workspaceId, { filename, contentType, body, allowVideo = false, allowAudio = false, maxBytes }, storage = createStorage(), pool = getPool()) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  const metadata = validateAssetInput({ filename, contentType, sizeBytes: bytes.length }, { maxBytes });
  const isImage = metadata.contentType.startsWith('image/');
  if (!isImage && !(allowVideo && metadata.contentType.startsWith('video/')) && !(allowAudio && metadata.contentType.startsWith('audio/'))) {
    throw new Error('Only images can be imported');
  }
  const existing = isImage ? await findExactTrustedWorkspaceAsset({
    workspaceId, body: bytes, contentType: metadata.contentType,
  }, storage, pool) : null;
  if (existing) {
    return {
      asset: existing,
      url: `/api/assets/${encodeURIComponent(existing.id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`,
    };
  }
  const assetId = randomUUID();
  const key = `${workspaceId}/${assetId}`;
  try {
    if (typeof storage.createUploadUrl === 'function') {
      const upload = await storage.createUploadUrl({ key, contentType: metadata.contentType });
      await storage.put(upload.url || upload, bytes, metadata.contentType);
    } else {
      await storage.put(key, bytes, metadata.contentType);
    }
    const result = await pool.query(
      `INSERT INTO assets (id, workspace_id, storage_key, filename, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, workspace_id, storage_key, filename, content_type, size_bytes, created_at`,
      [assetId, workspaceId, key, metadata.filename, metadata.contentType, metadata.sizeBytes],
    );
    return {
      asset: result.rows[0],
      url: `/api/assets/${encodeURIComponent(assetId)}/download?workspace_id=${encodeURIComponent(workspaceId)}`,
    };
  } catch (error) {
    await storage.delete?.(key).catch(() => {});
    throw error;
  }
}

export async function createAssetUpload(workspaceId, input, storage = createStorage()) {
  const metadata = validateAssetInput(input);
  const assetId = randomUUID();
  const key = `${workspaceId}/${assetId}`;
  const upload = await storage.createUploadUrl({ key, contentType: metadata.contentType });
  const result = await getPool().query(
    `INSERT INTO assets (id, workspace_id, storage_key, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, workspace_id, storage_key, filename, content_type, size_bytes, created_at`,
    [assetId, workspaceId, key, metadata.filename, metadata.contentType, metadata.sizeBytes],
  );
  return { asset: result.rows[0], upload };
}

export async function listWorkspaceAssets(workspaceId, pool = getPool()) {
  if (!workspaceId) throw new Error('workspace_id is required');
  const result = await pool.query(
    `SELECT a.id, a.workspace_id, a.storage_key, a.filename, a.content_type, a.size_bytes, a.created_at,
            bal.status AS byteplus_trust_status,
            bal.provider_asset_id IS NOT NULL AS byteplus_has_provider_asset
     FROM assets a
     LEFT JOIN byteplus_asset_links bal
       ON bal.workspace_id = a.workspace_id AND bal.local_asset_id = a.id
      AND bal.canvas_project_id = 'workspace'
     WHERE a.workspace_id = $1 ORDER BY a.created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(({
    byteplus_trust_status: status,
    byteplus_has_provider_asset: hasProviderAsset,
    ...asset
  }) => ({
    ...asset,
    url: `/api/assets/${encodeURIComponent(asset.id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`,
    byteplus_trust: !status
      ? { status: 'not_trusted' }
      : status === 'active' && !hasProviderAsset
        ? { status: 'failed', error: { code: 'BYTEPLUS_ASSET_INVALID_STATE', message: 'Trusted asset is unavailable. Retry trust.' } }
        : status === 'failed'
          ? { status: 'failed', error: { code: 'BYTEPLUS_ASSET_PROCESSING_FAILED', message: 'BytePlus could not process this asset.' } }
          : { status },
  }));
}

export async function deleteWorkspaceAsset(workspaceId, assetId, storage = createStorage(), pool = getPool()) {
  if (!workspaceId) throw new Error('workspace_id is required');
  if (!assetId) throw new Error('asset_id is required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, workspace_id, storage_key FROM assets WHERE workspace_id = $1 AND id = $2 FOR UPDATE',
      [workspaceId, assetId],
    );
    const asset = result.rows[0];
    if (!asset) {
      await client.query('COMMIT');
      return null;
    }
    await client.query('DELETE FROM generation_outputs WHERE workspace_id = $1 AND asset_id = $2', [workspaceId, assetId]);
    await client.query('DELETE FROM assets WHERE workspace_id = $1 AND id = $2', [workspaceId, assetId]);
    await storage.delete(asset.storage_key);
    await client.query('COMMIT');
    return asset;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Display downloads (canvas/gallery) get a URL that is identical for 6 hours
// and a cacheable response, so reopening or refreshing a canvas reuses the
// browser cache instead of downloading every image again. No spaces: SigV4
// needs %20, which URLSearchParams would encode as "+".
export const DISPLAY_DOWNLOAD_CACHE = {
  cacheWindowSeconds: 6 * 60 * 60,
  responseCacheControl: 'private,max-age=21600,immutable',
};

// "Save as" for a download button. Only characters SigV4 and URLSearchParams
// encode the same way (see above), so the signed URL stays valid.
export function attachmentDisposition(filename) {
  const safe = String(filename || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 120) || 'download';
  return `attachment;filename="${safe}"`;
}

export async function createAssetDownload(workspaceId, assetId, storage = createStorage(), downloadOptions = {}, { variant = null, attachment = false, ensureThumbnail = ensureAssetThumbnail } = {}) {
  if (!workspaceId) throw new Error('workspace_id is required');
  if (!assetId) throw new Error('asset_id is required');
  const result = await getPool().query(
    'SELECT id, workspace_id, storage_key, filename, content_type, size_bytes, created_at FROM assets WHERE workspace_id = $1 AND id = $2 LIMIT 1',
    [workspaceId, assetId],
  );
  const asset = result.rows[0];
  if (!asset) return null;
  let key = asset.storage_key;
  if (variant === 'thumb') {
    try {
      key = (await ensureThumbnail(storage, asset)) || asset.storage_key;
    } catch (error) {
      // A thumbnail is an optimization: never fail the view because of it.
      console.error('[asset-thumbnail] falling back to original', asset.id, error?.message);
    }
  }
  const options = attachment ? { ...downloadOptions, responseContentDisposition: attachmentDisposition(asset.filename) } : downloadOptions;
  return { asset, download: await storage.createDownloadUrl({ key, ...options }) };
}
