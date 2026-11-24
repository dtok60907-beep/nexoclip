import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../src/services/tenantContext.js';
import { getPool } from '../../../src/db/pool.js';
import { listWorkspaceIntegrations } from '../../../src/repositories/workspaceIntegrationRepository.mjs';
import { INTEGRATION_PROVIDERS, integrationOAuthConfig } from '../../../src/services/workspaceIntegrations.mjs';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const tenant = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId: request.headers.get('x-workspace-id') });
    const configured = Object.fromEntries(INTEGRATION_PROVIDERS.map((provider) => {
      try { integrationOAuthConfig(provider); return [provider, true]; } catch { return [provider, false]; }
    }));
    return Response.json({ integrations: await listWorkspaceIntegrations(getPool(), { workspaceId: tenant.workspace.id, userId: tenant.user.id }), configured },
      { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
    return Response.json({ error: status >= 500 ? 'Integrations unavailable' : error.message }, { status });
  }
}
