import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { createAssetDownload, createStorage, DISPLAY_DOWNLOAD_CACHE } from '../../../../../src/services/assetService.js';

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return Response.json({ error: error.message }, { status });
}

export async function GET(request, { params }) {
  try {
    const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
    if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
    const tenant = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
    const { assetId } = await params;
    const variant = new URL(request.url).searchParams.get('variant') === 'thumb' ? 'thumb' : null;
    const result = await createAssetDownload(tenant.workspace.id, assetId, createStorage(), DISPLAY_DOWNLOAD_CACHE, { variant });
    if (!result) return Response.json({ error: 'Asset not found' }, { status: 404 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.download.url,
        // The target URL stays valid for at least 6 more hours; caching the
        // redirect lets a refresh skip this round-trip as well.
        'Cache-Control': 'private, max-age=600',
        'Vary': 'Cookie',
      },
    });
  } catch (error) { return errorResponse(error); }
}
