import { createHmac } from 'node:crypto';
import { getPool } from '../../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';

// Who is chatting, for the support chat (Tawk.to): name and email, signed for its secure
// mode so a visitor cannot pose as another account, plus the workspace, balance and an
// admin link so the team answering needs no back-and-forth.
export function createSupportIdentityHandler({ sessionLookup = getCurrentSession, workspaceLookup = getDefaultWorkspace, pool = null, env = process.env } = {}) {
  return async function GET(request) {
    const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
    const session = await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
    // Signed out, or an operator impersonating: no identity, and no chat as the customer.
    if (!session || session.impersonator_user_id) return Response.json({ identity: null }, { headers });
    const workspace = await workspaceLookup(session.user_id).catch(() => null);
    const balance = workspace
      ? Number((await (pool || getPool()).query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspace.id])).rows[0]?.balance || 0)
      : null;
    const origin = env.PUBLIC_APP_URL ? new URL(env.PUBLIC_APP_URL).origin : '';
    return Response.json({
      identity: {
        name: session.display_name || session.email,
        email: session.email,
        hash: env.TAWK_SECURE_KEY ? createHmac('sha256', env.TAWK_SECURE_KEY).update(session.email).digest('hex') : null,
        attributes: {
          'user-id': session.user_id,
          workspace: workspace?.name || '-',
          'saldo-kredit': balance === null ? '-' : String(Math.round(balance * 10) / 10),
          'admin-akun': `${origin}/admin/accounts?q=${encodeURIComponent(session.email)}`,
        },
      },
    }, { headers });
  };
}

export const GET = createSupportIdentityHandler();
