// Shared by the Motion project routes: the signed-in member's workspace (x-workspace-id) and error replies.
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function motionTenant(request, resolve = resolveTenantContext) {
  const workspaceId = request.headers.get('x-workspace-id');
  if (!workspaceId || !UUID.test(workspaceId)) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  return resolve({ token: request.cookies?.get(SESSION_COOKIE)?.value, workspaceId });
}

export function errorResponse(error, logError = console.error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
  if (status >= 500) logError('motion project request failed', error);
  return Response.json({ error: status >= 500 ? 'Project tidak bisa disimpan sekarang.' : error.message }, { status });
}
