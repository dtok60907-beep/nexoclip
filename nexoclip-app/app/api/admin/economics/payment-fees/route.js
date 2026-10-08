import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { isPlatformOperator } from '../../../../../src/services/economicsService.js';
import { listPaymentFeeCandidates, reconcilePaymentFee } from '../../../../../src/services/paymentFeeService.js';
import { getPool } from '../../../../../src/db/pool.js';

export const dynamic = 'force-dynamic';
export function createPaymentFeeGetHandler({ resolveContext = resolveTenantContext, list = listPaymentFeeCandidates, poolFactory = getPool, env = process.env } = {}) {
  return async function GET(request) {
    try {
      const workspaceId = request.headers.get('x-workspace-id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      if (!isPlatformOperator(tenant.user.id, env)) return Response.json({ error: 'Platform operator access required' }, { status: 403 });
      const params = new URL(request.url).searchParams;
      const result = await list(poolFactory(), { workspaceId: tenant.workspace.id, page: params.get('page'), pageSize: params.get('pageSize') });
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      return Response.json({ error: status === 500 ? 'Unable to list payment fees' : error.message }, { status });
    }
  };
}
export function createPaymentFeeHandler({ resolveContext = resolveTenantContext, reconcile = reconcilePaymentFee, poolFactory = getPool, env = process.env } = {}) {
  return async function POST(request) {
    try {
      const workspaceId = request.headers.get('x-workspace-id');
      if (!workspaceId) return Response.json({ error: 'workspace_id is required' }, { status: 400 });
      const tenant = await resolveContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
      if (!isPlatformOperator(tenant.user.id, env)) return Response.json({ error: 'Platform operator access required' }, { status: 403 });
      const body = await request.json();
      const result = await reconcile(poolFactory(), { ...body, workspaceId: tenant.workspace.id, userId: tenant.user.id });
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : error instanceof SyntaxError ? 400 : 500);
      return Response.json({ error: status === 500 ? 'Unable to reconcile payment fee' : error.message }, { status });
    }
  };
}
export const POST = createPaymentFeeHandler();
export const GET = createPaymentFeeGetHandler();
