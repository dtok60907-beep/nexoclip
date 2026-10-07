import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { adminConsoleService } from '../../../../src/services/adminConsoleService.js';

export function createAdminConsoleGetHandler({ resolveContext = resolveTenantContext, service = adminConsoleService } = {}) {
  return async function GET(request) {
    const headers = { 'Cache-Control': 'private, no-store' };
    try {
      const url = new URL(request.url);
      const workspaceId = request.headers.get('x-workspace-id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400, headers });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      const data = await service.read({ userId: tenant.user.id, workspaceId: tenant.workspace.id, section: url.searchParams.get('section') || 'overview', input: Object.fromEntries(url.searchParams) });
      return Response.json(data, { headers });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Data admin tidak dapat dimuat' : error.message }, { status, headers });
    }
  };
}
export const GET = createAdminConsoleGetHandler();
