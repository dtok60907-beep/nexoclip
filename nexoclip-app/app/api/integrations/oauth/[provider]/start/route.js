import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE, sessionCookieOptions, hashSessionToken } from '../../../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../../src/services/tenantContext.js';
import { INTEGRATION_PROVIDERS, integrationOAuthConfig, integrationAuthorizationUrl, integrationStateHash } from '../../../../../../src/services/workspaceIntegrations.mjs';
import { createIntegrationState } from '../../../../../../src/repositories/workspaceIntegrationRepository.mjs';
import { getPool } from '../../../../../../src/db/pool.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { provider } = await params;
    if (!INTEGRATION_PROVIDERS.includes(provider)) return Response.json({ error: 'Integration not found' }, { status: 404 });
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const tenant = await resolveTenantContext({ token, workspaceId: request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id') });
    requireCanSpend(tenant);
    const config = integrationOAuthConfig(provider);
    const state = randomBytes(32).toString('base64url');
    await createIntegrationState(getPool(), { stateHash: integrationStateHash(state), userId: tenant.user.id, workspaceId: tenant.workspace.id, provider, sessionHash: hashSessionToken(token) });
    const response = NextResponse.redirect(integrationAuthorizationUrl(provider, config, state));
    response.cookies.set('workspace_integration_oauth', state, { ...sessionCookieOptions(request), httpOnly: true, maxAge: 600 });
    return response;
  } catch (error) {
    const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 503);
    return Response.json({ error: status >= 500 ? 'Integration OAuth is not configured yet' : error.message }, { status });
  }
}
