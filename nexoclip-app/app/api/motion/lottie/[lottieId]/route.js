// An uploaded Motion Lottie animation, for members of the workspace that owns it.
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { createStorage } from '../../../../../src/services/assetService.js';
import { UUID, errorResponse } from '../../projects/shared.js';
import { lottieKey } from '../route.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Local storage reads through a signed download URL, R2 by key.
async function getObject(storage, key) {
  if (typeof storage.createUploadUrl === 'function') return storage.get((await storage.createDownloadUrl({ key })).url);
  return storage.get(key);
}

export function createLottieGetHandler({ resolve = resolveTenantContext, loadStorage = createStorage } = {}) {
  return async function GET(request, { params }) {
    try {
      const { lottieId } = await params;
      const workspaceId = new URL(request.url).searchParams.get('workspace_id');
      if (!UUID.test(lottieId || '') || !UUID.test(workspaceId || '')) return Response.json({ error: 'Not found' }, { status: 404 });
      const { workspace } = await resolve({ token: request.cookies?.get(SESSION_COOKIE)?.value, workspaceId });
      const object = await getObject(loadStorage(), lottieKey(workspace.id, lottieId)).catch(() => null);
      if (!object) return Response.json({ error: 'Not found' }, { status: 404 });
      return new Response(new Uint8Array(object.body), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' },
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const GET = createLottieGetHandler();
