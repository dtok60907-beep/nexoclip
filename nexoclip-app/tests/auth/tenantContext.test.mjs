import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantContext } from '../../src/services/tenantContext.js';

test('rejects a workspace when the session user is not a member', async () => {
  await assert.rejects(
    () => resolveTenantContext({
      token: 'session-token',
      workspaceId: 'workspace-b',
      sessionLookup: async () => ({ user_id: 'user-a' }),
      membershipLookup: async () => null,
    }),
    { message: 'Workspace access denied' },
  );
});

test('returns user and authorized workspace context', async () => {
  const context = await resolveTenantContext({
    token: 'session-token',
    workspaceId: 'workspace-a',
    sessionLookup: async () => ({ user_id: 'user-a', email: 'a@example.com' }),
    membershipLookup: async (userId, workspaceId) => ({
      id: workspaceId,
      user_id: userId,
      role: 'owner',
    }),
  });

  assert.deepEqual(context, {
    user: { id: 'user-a', email: 'a@example.com' },
    workspace: { id: 'workspace-a', user_id: 'user-a', role: 'owner' },
    impersonation: null,
  });
});

test('an operator impersonating in read-only mode cannot spend', async () => {
  const { requireCanSpend } = await import('../../src/services/tenantContext.js');
  assert.throws(() => requireCanSpend({ impersonation: { operatorId: 'op', readOnly: true } }), (error) => error.status === 403 && error.code === 'IMPERSONATION_READ_ONLY');
  assert.doesNotThrow(() => requireCanSpend({ impersonation: { operatorId: 'op', readOnly: false } }));
  assert.doesNotThrow(() => requireCanSpend({ impersonation: null }));
});
