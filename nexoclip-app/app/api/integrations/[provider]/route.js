import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../src/services/tenantContext.js';
import { INTEGRATION_PROVIDERS } from '../../../../src/services/workspaceIntegrations.mjs';
import { disconnectWorkspaceIntegration } from '../../../../src/repositories/workspaceIntegrationRepository.mjs';
import { getPool } from '../../../../src/db/pool.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
    const { provider } = await params;
    if (!INTEGRATION_PROVIDERS.includes(provider)) return Response.json({ error: 'Integration not found' }, { status: 404 });
    const tenant = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId: request.headers.get('x-workspace-id') });
    requireCanSpend(tenant);
    const disconnected = await disconnectWorkspaceIntegration(getPool(), { workspaceId: tenant.workspace.id, userId: tenant.user.id, provider });
    return Response.json({ disconnected });
  } catch (error) {
    const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
    return Response.json({ error: status >= 500 ? 'Could not disconnect integration' : error.message }, { status });
  }
}
