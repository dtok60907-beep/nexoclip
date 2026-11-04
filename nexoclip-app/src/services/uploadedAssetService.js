import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { R2ObjectStorage } from '../storage/r2ObjectStorage.js';
import { LocalObjectStorage } from '../storage/localObjectStorage.js';

function extensionFor(filename, contentType) {
  const fromName = (filename || '').split('.').pop();
  if (fromName && fromName.length <= 8 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = (contentType || '').split('/').pop();
  return fromType ? fromType.replace('+xml', '') : 'bin';
}

export function createUploadedAssetStorage(env = process.env) {
  if (env.R2_BUCKET && env.R2_PUBLIC_URL && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return new R2ObjectStorage();
  }
  return new LocalObjectStorage({
    root: env.LOCAL_OBJECT_STORAGE_DIR || '.local-object-storage',
    secret: env.LOCAL_OBJECT_STORAGE_SECRET || 'development-only-change-me',
  });
}

export async function putUploadedObject(storage, key, buffer, contentType) {
  if (typeof storage.createUploadUrl === 'function') {
    const upload = await storage.createUploadUrl({ key, contentType });
    await storage.put(upload.url, buffer, contentType);
    return null;
  }
  return storage.put(key, buffer, contentType);
}

export async function persistUploadedAsset({ workspaceId, buffer, contentType, filename, storage = createUploadedAssetStorage() }) {
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  const extension = extensionFor(filename, contentType);
  const key = `${workspaceId}/uploads/${randomUUID()}.${extension}`;
  await putUploadedObject(storage, key, buffer, contentType);
  const result = await getPool().query(
    `INSERT INTO assets (workspace_id, storage_key, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id, storage_key, filename, content_type, size_bytes, created_at`,
    [workspaceId, key, filename || key.split('/').pop(), contentType, buffer.length],
  );
  // Keep the browser-facing reference tenant-scoped. The worker resolves this
  // canonical URL to a signed/public storage URL before calling a provider.
  return {
    ...result.rows[0],
    url: `/api/assets/${encodeURIComponent(result.rows[0].id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`,
  };
}
