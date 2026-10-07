import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { createAssetDownload, createStorage, DISPLAY_DOWNLOAD_CACHE } from '../../../../../src/services/assetService.js';

export const runtime = 'nodejs';

export function createAssetDownloadGetHandler({ resolveContext = resolveTenantContext, getDownload = createAssetDownload, storageFactory = createStorage } = {}) {
  return async function GET(request, { params }) {
    try {
      const url = new URL(request.url);
      const workspaceId = request.headers.get('x-workspace-id') || url.searchParams.get('workspace_id');
      if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      const { assetId } = await params;
      const variant = url.searchParams.get('variant') === 'thumb' ? 'thumb' : null;
      const storage = storageFactory();
      const result = await getDownload(tenant.workspace.id, assetId, storage, DISPLAY_DOWNLOAD_CACHE, { variant });
      if (!result) return Response.json({ error: 'Asset not found' }, { status: 404 });
      const target = result.download.url;
      // local:// is a signed server-side storage capability, not a browser URL.
      // Read only after session, membership and workspace-scoped asset lookup.
      if (new URL(target).protocol === 'local:') {
        const object = await storage.get(target);
        const contentType = object.contentType || 'application/octet-stream';
        const inline = /^(image\/(png|jpeg|webp|gif|avif|bmp)|video\/|audio\/)/i.test(contentType);
        return new Response(new Uint8Array(object.body), { headers: {
          'Content-Type': contentType,
          'Content-Length': String(object.body.length),
          'Content-Disposition': inline ? 'inline' : 'attachment',
          'Cache-Control': 'private, max-age=600',
          'Vary': 'Cookie',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'",
        } });
      }
      return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'private, max-age=600', Vary: 'Cookie' } });
    } catch (error) {
      const status = error.code === 'ENOENT' ? 404 : error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Asset download unavailable' : status === 404 ? 'Asset not found' : error.message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
    }
  };
}
export const GET = createAssetDownloadGetHandler();
