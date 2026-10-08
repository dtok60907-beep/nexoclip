import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { economicsService, isPlatformOperator, operatorError } from '../../../../src/services/economicsService.js';

export function createEconomicsGetHandler({ resolveContext = resolveTenantContext, service = economicsService, env = process.env } = {}) {
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  return async function GET(request) {
    try {
      const url = new URL(request.url);
      const workspaceId = request.headers.get('x-workspace-id') || url.searchParams.get('workspace_id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400, headers });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      if (!isPlatformOperator(tenant.user.id, env)) throw operatorError();
      if(url.searchParams.has('export')) {
        if(url.searchParams.get('export')!=='job-issues-csv')throw Object.assign(new Error('Format ekspor tidak valid'),{status:400});
        const result=await service.exportIssues({workspaceId:tenant.workspace.id,userId:tenant.user.id,filters:Object.fromEntries(url.searchParams)});
        return new Response(result.csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${result.filename}"`,'X-Content-Type-Options':'nosniff'}});
      }
      const data = await service.getReport({ workspaceId: tenant.workspace.id, userId: tenant.user.id, filters: Object.fromEntries(url.searchParams) });
      return Response.json(data, { headers });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status >= 500 ? 'Economics report unavailable' : error.message, code: error.code }, { status, headers });
    }
  };
}

export const GET = createEconomicsGetHandler();
