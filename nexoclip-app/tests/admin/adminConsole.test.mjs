import test from 'node:test';
import assert from 'node:assert/strict';
import { consoleFilters, createAdminConsoleService } from '../../src/services/adminConsoleService.js';
import { createAdminConsoleGetHandler } from '../../app/api/admin/console/route.js';
import { createAdminConsoleRepository } from '../../src/repositories/adminConsoleRepository.js';
const env = { NEXOCLIP_OPERATOR_USER_IDS: 'operator' };
const args = { userId: 'operator', workspaceId: 'verified', section: 'jobs', input: { from: '2026-10-01', to: '2026-10-07' } };
test('console denies nonoperators before reading data and rejects unknown sections', async () => {
  let calls = 0;
  const service = createAdminConsoleService({ env, repository: { list: async () => { calls++; } } });
  await assert.rejects(service.read({ ...args, userId: 'owner' }), { status: 403 });
  await assert.rejects(service.read({ ...args, section: 'sessions' }), { status: 400 });
  assert.equal(calls, 0);
});
test('filters reject invalid dates, pagination, IDs and statuses', () => {
  for (const input of [{ from: '2026-02-30' }, { from: '2026-10-08', to: '2026-10-07' }, { page: '-1' }, { page: '2.1' }, { id: 'malicious' }, { status: 'secret' }]) assert.throws(() => consoleFilters(input, new Date('2026-10-07')), { status: 400 });
});
test('route uses authenticated workspace and actor, not query identities', async () => {
  let received;
  const service = createAdminConsoleService({ env, repository: { list: async (...input) => { received = input; return { items: [], pagination: {} }; } } });
  const handler = createAdminConsoleGetHandler({ service, resolveContext: async () => ({ user: { id: 'operator' }, workspace: { id: 'verified' } }) });
  const request = new Request('http://app/api/admin/console?section=jobs&userId=forged&workspace_id=forged', { headers: { 'x-workspace-id': 'untrusted' } }); request.cookies = { get: () => ({ value: 'token' }) };
  const response = await handler(request);
  assert.equal(response.status, 200); assert.equal(received[0], 'verified'); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('route preserves membership denials and hides internal errors', async () => {
  for (const [message, status] of [['Authentication required', 401], ['Workspace access denied', 403], ['database secret', 500]]) {
    const handler = createAdminConsoleGetHandler({ resolveContext: async () => { throw new Error(message); } });
    const request = new Request('http://app/api/admin/console', { headers: { 'x-workspace-id': 'workspace' } }); request.cookies = { get: () => undefined };
    const response = await handler(request); assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    if (status === 500) assert.doesNotMatch(JSON.stringify(await response.json()), /secret/);
  }
});
test('repository scopes both rows and counts and binds hostile search input', async () => {
  const calls = [];
  const repository = createAdminConsoleRepository({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: sql.includes('count(*)') ? [{ total: 0 }] : [] }; } });
  for (const kind of ['customers', 'transactions', 'credits', 'jobs']) await repository.list('verified', kind, { ...consoleFilters(args.input), q: "' OR 1=1 --%_" });
  assert.equal(calls.length, 8);
  for (const call of calls) { assert.match(call.sql, /workspace_id = \$1/); assert.match(call.sql, /AT TIME ZONE 'UTC'/); assert.equal(call.values[0], 'verified'); assert.doesNotMatch(call.sql, /OR 1=1/); assert.match(call.values[3], /\\%\\_/); }
});
