import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { R2ObjectStorage } from '../storage/r2ObjectStorage.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function unsupportedImageError() {
  return Object.assign(new Error('Generated image format is unsupported'), { code: 'INVALID_IMAGE_OUTPUT', status: 502 });
}

// Provider outputs are either an inline base64 data URL (OpenRouter, Google, OpenAI) or a
// hosted https URL (BytePlus returns a pre-signed TOS link) — both need to end up as bytes here.
async function loadImageBytes(dataUrl, fetchImpl) {
  const dataUrlMatch = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl || '');
  if (dataUrlMatch) return { contentType: dataUrlMatch[1], body: Buffer.from(dataUrlMatch[2], 'base64') };
  if (!/^https?:\/\//i.test(dataUrl || '')) throw unsupportedImageError();
  let response;
  try { response = await fetchImpl(dataUrl); } catch { throw unsupportedImageError(); }
  if (!response.ok) throw unsupportedImageError();
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw unsupportedImageError();
  return { contentType, body: Buffer.from(await response.arrayBuffer()) };
}

export async function persistGeneratedImage({ workspaceId, dataUrl, filename, storage = new R2ObjectStorage(), fetch: fetchImpl = globalThis.fetch, query = (...args) => getPool().query(...args) }) {
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  const { contentType, body } = await loadImageBytes(dataUrl, fetchImpl);
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length);
  const namePrefix = filename ? `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}-` : '';
  const key = `${workspaceId}/generated/${namePrefix}${randomUUID()}.${extension}`;
  const url = await storage.put(key, body, contentType);
  const result = await query(
    `INSERT INTO assets (workspace_id, storage_key, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, workspace_id, storage_key, filename, content_type, size_bytes, created_at`,
    [workspaceId, key, key.split('/').pop(), contentType, body.length],
  );
  return { ...result.rows[0], url };
}
