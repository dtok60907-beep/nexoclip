// Lottie animations a user uploads for the Motion studio: the .json is checked, stripped of expressions
// (lottieLibrary.js) and kept in the workspace's storage; the studio plays it from GET /api/motion/lottie/<id>.
import { randomUUID } from 'node:crypto';
import { createStorage } from '../../../../src/services/assetService.js';
import { MAX_LOTTIE_BYTES, sanitizeLottie } from '../../../../components/motion/lottieLibrary.js';
import { errorResponse, motionTenant } from '../projects/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const lottieKey = (workspaceId, id) => `${workspaceId}/motion-lottie/${id}.json`;

// Local storage writes through a signed upload URL, R2 by key (as importWorkspaceAsset does).
export async function putObject(storage, key, body, contentType) {
  if (typeof storage.createUploadUrl === 'function') {
    const upload = await storage.createUploadUrl({ key, contentType });
    return storage.put(upload.url || upload, body, contentType);
  }
  return storage.put(key, body, contentType);
}

export function createLottieUploadHandler({ tenant = motionTenant, loadStorage = createStorage, newId = randomUUID } = {}) {
  return async function POST(request) {
    try {
      const { workspace } = await tenant(request);
      const text = await request.text();
      if (text.length > MAX_LOTTIE_BYTES) return Response.json({ error: 'File Lottie maksimal 1,5 MB.' }, { status: 413 });
      let parsed;
      try { parsed = JSON.parse(text); } catch { return Response.json({ error: 'File ini bukan JSON.' }, { status: 400 }); }
      const clean = sanitizeLottie(parsed);
      if (!clean) return Response.json({ error: 'File ini bukan animasi Lottie.' }, { status: 400 });
      const id = newId();
      await putObject(loadStorage(), lottieKey(workspace.id, id), Buffer.from(JSON.stringify(clean)), 'application/json');
      return Response.json({ src: `/api/motion/lottie/${id}?workspace_id=${workspace.id}` }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const POST = createLottieUploadHandler();
