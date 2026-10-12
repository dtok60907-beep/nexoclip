import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRenderUploadHandler, MAX_RENDER_BYTES } from './route.js';
import { signCanvasAuthorization } from '../../../../../src/lib/realtime/internalAuth.js';

const userId = '11111111-1111-4111-8111-111111111111';
const SECRET = 'bridge-secret';

function upload(body, { meta = {}, secret = SECRET } = {}) {
  const requestJson = JSON.stringify({
    action: 'upload-render', filename: 'Shore Thing.mp4', size: body.length,
    sha256: createHash('sha256').update(body).digest('hex'), ...meta,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCanvasAuthorization({
    userId, projectId: 'storyboard', timestamp, nonce: 'n1', actionDigest: createHash('sha256').update(requestJson).digest('hex'),
  }, secret);
  return new Request('http://app/api/internal/director/render-upload', {
    method: 'POST', body,
    headers: {
      'content-type': 'video/mp4', 'x-director-user-id': userId, 'x-director-timestamp': String(timestamp),
      'x-director-nonce': 'n1', 'x-director-signature': signature,
      'x-director-request': Buffer.from(requestJson).toString('base64'),
    },
  });
}

function handler(imported) {
  return createRenderUploadHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, SECRET),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({}),
    createStorage: () => ({}),
    importAsset: async (workspaceId, input) => { imported.push({ workspaceId, ...input }); return { asset: { id: 'asset-render' } }; },
    logError: () => {},
  });
}

test('stores a signed render as an MP4 asset in the default workspace', async () => {
  const imported = [];
  const body = Buffer.alloc(12 * 1024 * 1024, 7); // bigger than the 10 MB middleware clone limit
  const response = await handler(imported)(upload(body));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { assetId: 'asset-render' });
  assert.equal(imported[0].workspaceId, 'workspace-1');
  assert.equal(imported[0].contentType, 'video/mp4');
  assert.equal(imported[0].allowVideo, true);
  assert.equal(imported[0].maxBytes, MAX_RENDER_BYTES);
  assert.equal(imported[0].body.length, body.length);
});

test('rejects bad signatures, bodies that differ from what was signed, and oversized renders', async () => {
  const imported = [];
  const post = handler(imported);
  const body = Buffer.from('mp4');
  assert.equal((await post(upload(body, { secret: 'wrong' }))).status, 404);
  assert.equal((await post(upload(body, { meta: { sha256: '0'.repeat(64) } }))).status, 400);
  assert.equal((await post(upload(body, { meta: { size: MAX_RENDER_BYTES + 1 } }))).status, 400);
  assert.equal(MAX_RENDER_BYTES, 200 * 1024 * 1024);
  assert.equal(imported.length, 0);
});

test('the middleware leaves the render upload alone (it would truncate bodies over 10 MB)', async () => {
  // middleware.js imports next/server, which plain node cannot load; read its matcher from the source.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../../../../middleware.js', import.meta.url), 'utf8');
  const config = { matcher: [...source.match(/matcher: \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) };
  const matches = (path) => config.matcher.some((m) => new RegExp(`^${m.replace('/:path*', '(/.*)?')}$`).test(path));
  assert.equal(matches('/api/internal/director/render-upload'), false);
  assert.equal(matches('/api/director/projects'), true);
  assert.equal(matches('/studio/director'), true);
});
