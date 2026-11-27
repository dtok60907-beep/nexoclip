// Shared tenant authentication helper for /api/marketing/* route handlers.
import { SESSION_COOKIE } from './auth/session.js';
import { resolveTenantContext } from '../services/tenantContext.js';
import { getPool } from '../db/pool.js';

export async function requireMarketingTenant(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspaceId') || '';

  // Fall back to the user's first workspace when header is omitted (e.g. direct navigation from Canvas seed)
  if (!workspaceId && token) {
    const base = await resolveTenantContext({ token });
    if (base?.workspace?.id) return base;
    const res = await getPool().query(
      'SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [base.user.id],
    );
    workspaceId = res.rows[0]?.workspace_id || '';
  }

  if (!workspaceId) {
    throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  }
  return resolveTenantContext({ token, workspaceId });
}

export function marketingErrorResponse(error) {
  const status =
    error?.status ||
    (error?.message === 'Authentication required'
      ? 401
      : error?.message === 'Workspace access denied'
        ? 403
        : 500);
  if (status >= 500) console.error('[marketing-api]', error);
  return Response.json(
    { error: status >= 500 ? 'AI Creative Marketing sedang mengalami kendala. Coba sebentar lagi.' : error.message },
    { status },
  );
}
