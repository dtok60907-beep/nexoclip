// nexoclip-app/tests/api/workspacesRoute.test.mjs
process.env.DATABASE_URL ||= 'postgres://test:test@localhost/test';

import test from 'node:test';
import assert from 'node:assert/strict';

const { createWorkspacesHandlers } = await import('../../app/api/workspaces/route.js');
const { createSwitchWorkspaceHandler } = await import('../../app/api/workspaces/current/route.js');
const { createWorkspace, switchWorkspace, WorkspaceError, MAX_OWNED_WORKSPACES } = await import('../../src/services/workspaceService.js');

const okSession = async () => ({ user_id: 'u1' });
function req(url, { method = 'GET', body } = {}) {
  const request = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  request.cookies = { get: (n) => (n === 'nexoclip_session' ? { value: 'tok' } : undefined) };
  return request;
}

function fakePool({ owned = 0 } = {}) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text: text.replace(/\s+/g, ' ').trim(), values });
      if (/count\(\*\)/.test(text)) return { rows: [{ count: owned }] };
      if (/INSERT INTO workspaces/.test(text)) return { rows: [{ id: 'ws-new', name: values[0], slug: values[1] }] };
      if (/FROM workspace_memberships wm JOIN workspaces/.test(text.replace(/\s+/g, ' '))) {
        return { rows: values[0] === '11111111-2222-3333-4444-555555555555' ? [{ id: values[0], name: 'Studio', role: 'owner' }] : [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { calls, pool: { connect: async () => client, query: client.query }, client };
}

test('creates an owned workspace with its own credit wallet and switches to it', async () => {
  const { pool, calls } = fakePool();
  const workspace = await createWorkspace({ userId: 'u1', name: '  Klien   Kopi ', pool });
  assert.equal(workspace.name, 'Klien Kopi');
  assert.match(workspace.slug, /^klien-kopi-[0-9a-f]{6}$/);
  const texts = calls.map((c) => c.text);
  assert.equal(texts[0], 'BEGIN');
  assert.ok(texts.some((t) => t.startsWith("INSERT INTO workspace_memberships") && t.includes("'owner'")));
  assert.ok(texts.some((t) => t.startsWith('INSERT INTO credit_accounts')));
  assert.ok(calls.some((c) => c.text.startsWith('UPDATE users SET current_workspace_id') && c.values[1] === 'ws-new'));
  assert.equal(texts[texts.length - 1], 'COMMIT');
});

test('rejects bad names and too many workspaces, rolling back', async () => {
  await assert.rejects(createWorkspace({ userId: 'u1', name: 'x', pool: fakePool().pool }), WorkspaceError);
  const { pool, calls } = fakePool({ owned: MAX_OWNED_WORKSPACES });
  await assert.rejects(createWorkspace({ userId: 'u1', name: 'Satu lagi', pool }), /Maksimal/);
  assert.ok(calls.some((c) => c.text === 'ROLLBACK'));
  assert.ok(!calls.some((c) => c.text.startsWith('INSERT INTO workspaces')));
});

test('switching only works for workspaces the user belongs to', async () => {
  const { pool, calls } = fakePool();
  await switchWorkspace({ userId: 'u1', workspaceId: '11111111-2222-3333-4444-555555555555', pool });
  assert.ok(calls.some((c) => c.text.startsWith('UPDATE users SET current_workspace_id')));
  await assert.rejects(switchWorkspace({ userId: 'u1', workspaceId: '99999999-2222-3333-4444-555555555555', pool: fakePool().pool }), /tidak ditemukan/);
  await assert.rejects(switchWorkspace({ userId: 'u1', workspaceId: "x' OR 1=1", pool: fakePool().pool }), /tidak ditemukan/);
});

test('workspace routes require a session and map errors', async () => {
  const anon = createWorkspacesHandlers({ getSession: async () => null });
  assert.equal((await anon.GET(req('http://app/api/workspaces'))).status, 401);
  const handlers = createWorkspacesHandlers({
    getSession: okSession,
    listWorkspaces: async () => [{ id: 'ws-new', is_current: true }],
    createWorkspace: async ({ name }) => { if (!name) throw new WorkspaceError('Nama workspace harus 2–60 karakter.'); return { id: 'ws-new', name }; },
  });
  const created = await handlers.POST(req('http://app/api/workspaces', { method: 'POST', body: { name: 'Klien' } }));
  assert.equal(created.status, 201);
  assert.deepEqual((await created.json()).workspaces, [{ id: 'ws-new', is_current: true }]);
  assert.equal((await handlers.POST(req('http://app/api/workspaces', { method: 'POST', body: {} }))).status, 400);

  const put = createSwitchWorkspaceHandler({
    getSession: okSession,
    switchWorkspace: async ({ workspaceId }) => { if (workspaceId !== 'ws-2') throw new WorkspaceError('Workspace tidak ditemukan.', 404); },
    listWorkspaces: async () => [{ id: 'ws-2', is_current: true }],
  });
  assert.equal((await put(req('http://app/api/workspaces/current', { method: 'PUT', body: { workspaceId: 'ws-2' } }))).status, 200);
  assert.equal((await put(req('http://app/api/workspaces/current', { method: 'PUT', body: { workspaceId: 'ws-x' } }))).status, 404);
  assert.equal((await put(req('http://app/api/workspaces/current', { method: 'PUT', body: {} }))).status, 400);
});
