import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { usageAnalyticsService } from '../../../../src/services/usageAnalyticsService.js';

// Usage, revenue and provider cost per kind of work and source, across every workspace (platform operators only).
export function createUsageAnalyticsGetHandler({ resolveContext = resolveTenantContext, service = usageAnalyticsService } = {}) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  return async function GET(request) {
    try {
      const url = new URL(request.url);
      const workspaceId = request.headers.get('x-workspace-id') || url.searchParams.get('workspace_id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400, headers });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      const data = await service.report({ userId: tenant.user.id, input: Object.fromEntries(url.searchParams) });
      return Response.json(data, { headers });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Analytics unavailable' : error.message }, { status, headers });
    }
  };
}

export const GET = createUsageAnalyticsGetHandler();
