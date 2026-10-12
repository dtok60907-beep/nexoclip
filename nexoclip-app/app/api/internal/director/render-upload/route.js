import { createHash } from 'node:crypto';
import { getPool } from '../../../../../src/db/pool.js';
import { getDefaultWorkspace } from '../../../../../src/services/workspaceService.js';
import { createStorage, importWorkspaceAsset } from '../../../../../src/services/assetService.js';
import { verifyCanvasAuthorization } from '../../../../../src/lib/realtime/internalAuth.js';

export const runtime = 'nodejs';

// The AI Director's final render: the MP4 travels as the raw request body (not
// base64 JSON like the storyboard bridge), and this path is left out of the
// middleware matcher, whose body clone would cut it off at 10 MB.
export const MAX_RENDER_BYTES = 200 * 1024 * 1024;
const PROJECT_SCOPE = 'storyboard'; // same signing scope and secret as the storyboard bridge
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Headers: x-director-user-id, -timestamp, -nonce, -signature, and -request
 * (base64 of the signed JSON {action: "upload-render", filename, size, sha256}).
 */
export function createRenderUploadHandler({
  verify = (payload, signature) => verifyCanvasAuthorization(payload, signature, process.env.CANVAS_AUTH_SECRET),
  getDefaultWorkspace: findDefaultWorkspace = getDefaultWorkspace,
  getPool: loadPool = getPool,
  createStorage: loadStorage = createStorage,
  importAsset = importWorkspaceAsset,
  logError = console.error,
} = {}) {
  return async function POST(request) {
    try {
      const userId = request.headers.get('x-director-user-id') || '';
      const requestJson = Buffer.from(request.headers.get('x-director-request') || '', 'base64').toString('utf8');
      const authorization = {
        userId,
        projectId: PROJECT_SCOPE,
        timestamp: Number(request.headers.get('x-director-timestamp')),
        nonce: request.headers.get('x-director-nonce'),
        actionDigest: requestJson ? createHash('sha256').update(requestJson).digest('hex') : '',
      };
      if (!requestJson || !verify(authorization, request.headers.get('x-director-signature'))) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (!UUID.test(userId)) return badRequest('Invalid upload');
      let meta;
      try { meta = JSON.parse(requestJson); } catch { return badRequest('Invalid upload'); }
      if (meta?.action !== 'upload-render' || !Number.isInteger(meta.size) || typeof meta.sha256 !== 'string') return badRequest('Invalid upload');
      if (meta.size < 1 || meta.size > MAX_RENDER_BYTES) return badRequest('Render size is invalid');
      const declared = Number(request.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_RENDER_BYTES) return badRequest('Render size is invalid');

      const bytes = Buffer.from(await request.arrayBuffer());
      // The signature covers size and hash, so the body must be exactly what was signed.
      if (bytes.length !== meta.size || createHash('sha256').update(bytes).digest('hex') !== meta.sha256) {
        return badRequest('Upload does not match its signature');
      }
      const workspace = await findDefaultWorkspace(userId);
      if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });
      const filename = typeof meta.filename === 'string' && meta.filename.trim() ? meta.filename.trim().slice(0, 200) : 'director-render.mp4';
      const result = await importAsset(workspace.id, {
        filename, contentType: 'video/mp4', body: bytes, allowVideo: true, maxBytes: MAX_RENDER_BYTES,
      }, loadStorage(), loadPool());
      return Response.json({ assetId: result.asset.id }, { status: 201 });
    } catch (error) {
      logError('[director-render-upload]', error);
      return Response.json({ error: 'Render upload failed' }, { status: 500 });
    }
  };
}

export const POST = createRenderUploadHandler();
