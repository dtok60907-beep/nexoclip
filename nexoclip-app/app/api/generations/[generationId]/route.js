import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { getGenerationJob, toPublicGeneration } from '../../../../src/services/generationService.js';
import { createStorage } from '../../../../src/services/assetService.js';

function workspaceId(request) {
  return request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
}

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return Response.json({ error: error.message }, { status });
}

export function createGenerationStatusHandler({
  resolveContext = resolveTenantContext,
  getGeneration = getGenerationJob,
  createStorage: loadStorage = createStorage,
} = {}) {
  return async function GET(request, { params }) {
    try {
      const id = workspaceId(request);
      if (!id) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId: id });
      const { generationId } = await params;
      const generation = await getGeneration(tenant.workspace.id, generationId, loadStorage());
      if (!generation) return Response.json({ error: 'Generation not found' }, { status: 404 });
      return Response.json({ generation: toPublicGeneration(generation) });
    } catch (error) { return errorResponse(error); }
  };
}

export const GET = createGenerationStatusHandler();
