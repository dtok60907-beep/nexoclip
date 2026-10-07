import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { economicsService, isPlatformOperator, operatorError } from '../../../../src/services/economicsService.js';

export function createEconomicsGetHandler({ resolveContext = resolveTenantContext, service = economicsService, env = process.env } = {}) {
  return async function GET(request) {
    try {
      const url = new URL(request.url);
      const workspaceId = request.headers.get('x-workspace-id') || url.searchParams.get('workspace_id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      if (!isPlatformOperator(tenant.user.id, env)) throw operatorError();
      const data = await service.getReport({ workspaceId: tenant.workspace.id, userId: tenant.user.id, filters: Object.fromEntries(url.searchParams) });
      return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Economics report unavailable' : error.message, code: error.code }, { status });
    }
  };
}

export const GET = createEconomicsGetHandler();
