import { requirePlatformOperator } from '../../../../src/lib/auth/platformOperator.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { modelRatesService } from '../../../../src/services/modelRatesService.js';
export function createModelRatesGetHandler({ resolveContext = resolveTenantContext, service = modelRatesService, env = process.env } = {}) {
  return async function GET(request) {
    const headers = { 'Cache-Control': 'private, no-store' };
    try {
      const workspaceId = request.headers.get('x-workspace-id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400, headers });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      requirePlatformOperator(tenant.user.id, env);
      const params = new URL(request.url).searchParams;
      return Response.json(await service.read({ userId: tenant.user.id, key: params.get('key'), input: Object.fromEntries(params) }), { headers });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Tarif model tidak dapat dimuat' : error.message }, { status, headers });
    }
  };
}
export const GET = createModelRatesGetHandler();
