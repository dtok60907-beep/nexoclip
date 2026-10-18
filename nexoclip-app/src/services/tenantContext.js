import { getCurrentSession } from './authService.js';
import { requireWorkspaceMembership } from './workspaceService.js';

export async function resolveTenantContext({
  token,
  workspaceId,
  sessionLookup = getCurrentSession,
  membershipLookup = async (userId, id) => requireWorkspaceMembership({
    userId,
    workspaceId: id,
  }),
}) {
  const session = await sessionLookup(token);
  if (!session) throw new Error('Authentication required');

  const membership = await membershipLookup(session.user_id, workspaceId);
  if (!membership) throw new Error('Workspace access denied');

  return {
    user: { id: session.user_id, email: session.email },
    workspace: {
      id: membership.id,
      user_id: membership.user_id,
      role: membership.role,
    },
    impersonation: session.impersonator_user_id
      ? { operatorId: session.impersonator_user_id, readOnly: session.impersonation_read_only !== false }
      : null,
  };
}

// Spending credits or money is refused to an operator impersonating in read-only mode.
export function requireCanSpend(tenant) {
  if (tenant.impersonation?.readOnly) {
    throw Object.assign(new Error('Mode lihat saja: saat impersonate, data akun ini tidak bisa diubah.'), { status: 403, code: 'IMPERSONATION_READ_ONLY' });
  }
}
