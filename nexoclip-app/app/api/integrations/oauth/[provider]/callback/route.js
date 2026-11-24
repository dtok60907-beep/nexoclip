import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE, hashSessionToken } from '../../../../../../src/lib/auth/session.js';
import { publicAppOrigin } from '../../../../../../src/lib/auth/sameOrigin.js';
import { INTEGRATION_PROVIDERS, integrationOAuthConfig, exchangeIntegrationCode, encryptIntegrationToken, integrationStateHash } from '../../../../../../src/services/workspaceIntegrations.mjs';
import { consumeIntegrationState, saveWorkspaceIntegration } from '../../../../../../src/repositories/workspaceIntegrationRepository.mjs';
import { getPool } from '../../../../../../src/db/pool.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { provider } = await params;
  const destination = new URL('/studio/accounts', publicAppOrigin(request));
  const finish = (result) => { destination.searchParams.set('integration', result); destination.searchParams.set('provider', provider); return NextResponse.redirect(destination); };
  try {
    const url = new URL(request.url), state = url.searchParams.get('state'), code = url.searchParams.get('code');
    if (!INTEGRATION_PROVIDERS.includes(provider)) return finish('unsupported');
    if (url.searchParams.has('error')) return finish('cancelled');
    if (!state || !code || state !== request.cookies.get('workspace_integration_oauth')?.value) return finish('state_invalid');
    const sessionHash = hashSessionToken(request.cookies.get(SESSION_COOKIE)?.value || '');
    const pool = getPool();
    const ownedState = await consumeIntegrationState(pool, { stateHash: integrationStateHash(state), sessionHash, provider });
    if (!ownedState) return finish('state_expired');
    const account = await exchangeIntegrationCode(provider, code, integrationOAuthConfig(provider));
    await saveWorkspaceIntegration(pool, {
      workspaceId: ownedState.workspace_id, userId: ownedState.user_id, provider,
      providerUserId: account.providerUserId, displayName: account.displayName,
      accessTokenEncrypted: encryptIntegrationToken(account.accessToken),
      refreshTokenEncrypted: account.refreshToken ? encryptIntegrationToken(account.refreshToken) : null,
      scopes: account.scopes, expiresAt: account.expiresAt,
    });
    return finish('connected');
  } catch (error) {
    console.error('[integration-oauth-callback]', { provider, code: error.name || 'INTEGRATION_CALLBACK_FAILED' });
    return finish('connection_failed');
  }
}
