import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuditService } from '../../src/services/adminAuditService.js';

const env = { NEXOCLIP_OPERATOR_USER_IDS: 'operator' };
function repos(overrides = {}) {
  return {
    listGenerationJobs: async (workspaceId, filters) => ({ rows: [{ id: 'job-1', workspace_id: workspaceId, status: filters.status || 'succeeded', model: 'flux-dev' }], total: 1 }),
    listProviderUsage: async (workspaceId) => ({ rows: [{ id: 'usage-1', workspace_id: workspaceId, provider: 'muapi', actual_cost: '2' }], total: 1 }),
    getCreditAudit: async (workspaceId) => ({ balance: '8', rows: [{ id: 'entry-1', workspace_id: workspaceId, amount: '-2' }], total: 1 }),
    ...overrides,
  };
}

test('allows platform operators with workspace admin permission to read bounded audit data', async () => {
  const calls = [];
  const service = createAdminAuditService({ env,
    repositories: repos({
      listGenerationJobs: async (...args) => { calls.push(args); return { rows: [], total: 0 }; },
    }),
  });
  const result = await service.listJobs({ userId: 'operator', workspaceId: 'workspace-a', role: 'admin', filters: { page: '2', pageSize: '500', status: 'running' } });

  assert.deepEqual(result, { items: [], pagination: { page: 2, pageSize: 100, total: 0, totalPages: 0 } });
  assert.deepEqual(calls[0], ['workspace-a', { page: 2, pageSize: 100, status: 'running' }]);
});

test('rejects members and never queries repositories for unauthorized workspaces', async () => {
  let queried = false;
  const service = createAdminAuditService({ env, repositories: repos({ listGenerationJobs: async () => { queried = true; } }) });
  await assert.rejects(
    service.listJobs({ userId: 'operator', workspaceId: 'workspace-b', role: 'member', filters: {} }),
    (error) => error.status === 403 && error.code === 'ADMIN_REQUIRED',
  );
  assert.equal(queried, false);
});

test('returns jobs, provider usage, and credits without raw sensitive payloads', async () => {
  const service = createAdminAuditService({ env, repositories: repos() });
  const [jobs, usage, credits] = await Promise.all([
    service.listJobs({ userId: 'operator', workspaceId: 'w1', role: 'owner', filters: {} }),
    service.listUsage({ userId: 'operator', workspaceId: 'w1', role: 'owner', filters: {} }),
    service.listCredits({ userId: 'operator', workspaceId: 'w1', role: 'owner', filters: {} }),
  ]);

  assert.equal(jobs.items[0].prompt, undefined);
  assert.equal(usage.items[0].raw_usage, undefined);
  assert.equal(credits.balance, '8');
  assert.equal(credits.items[0].amount, '-2');
});
