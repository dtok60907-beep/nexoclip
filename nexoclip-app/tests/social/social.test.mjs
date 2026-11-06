import test from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { createPostizAdapter, encryptApiKey, decryptApiKey } from '../../src/providers/postiz/adapter.js';
import { createSocialService, requireSocialWrite, validateSocialPost } from '../../src/services/socialService.js';
import { resolveTenantContext } from '../../src/services/tenantContext.js';

const env = { POSTIZ_API_URL: 'https://social.example/api', POSTIZ_JWT_SECRET: 'test-secret-only-32-characters-long', POSTIZ_LINKEDIN_ENABLED: 'true' };
const workspaceId = '11111111-1111-4111-8111-111111111111';
const tenant = { workspace: { id: workspaceId, role: 'owner' } };
const input = { idempotencyKey: '22222222-2222-4222-8222-222222222222', type: 'draft', content: 'Meet NexoClip', channelId: 'channel-1' };

function fixture(overrides = {}) {
  let workspace = { status: 'ready', encrypted_api_key: encryptApiKey('org-key', workspaceId, env) };
  const submissions = new Map();
  const calls = { provision: 0, submit: 0, upload: 0 };
  const repo = {
    findSocialWorkspace: async () => workspace,
    claimSocialWorkspace: async () => { if (workspace) return false; workspace = { status: 'provisioning' }; return true; },
    completeSocialWorkspace: async (_db, _id, org, key) => { workspace = { status: 'ready', organization_id: org, encrypted_api_key: key }; },
    flagSocialWorkspace: async () => { workspace.status = 'needs_review'; },
    claimSubmission: async (_db, id, key, hash) => {
      const mapKey = `${id}:${key}`;
      if (submissions.has(mapKey)) return { claimed: false, row: submissions.get(mapKey) };
      const row = { request_hash: hash, status: 'submitting' };
      submissions.set(mapKey, row); return { claimed: true, row };
    },
    finishSubmission: async (_db, id, key, result) => Object.assign(submissions.get(`${id}:${key}`), { status: result ? 'accepted' : 'needs_review', result }),
  };
  const adapter = {
    provision: async () => { calls.provision++; return { id: 'org', apiKey: 'org-key' }; },
    channels: async () => [{ id: 'channel-1', identifier: 'linkedin', name: 'Creator', token: 'never-return-this' }],
    posts: async () => ({ posts: [] }),
    connect: async () => 'https://www.linkedin.com/oauth/v2/authorization',
    createPost: async () => { calls.submit++; return [{ postId: 'post-1' }]; },
    upload: async () => { calls.upload++; return { id: 'media', path: 'https://social.example/uploads/a.png' }; },
    ...overrides,
  };
  return { service: createSocialService({ env, db: () => ({}), repo, adapter, assetDownload: async () => null }), calls,
    clear: () => { workspace = null; }, workspace: () => workspace };
}

test('credential envelopes are randomized and cannot be swapped between tenants', () => {
  const encrypted = encryptApiKey('key', workspaceId, env);
  assert.notEqual(encrypted, encryptApiKey('key', workspaceId, env));
  assert.equal(decryptApiKey(encrypted, workspaceId, env), 'key');
  assert.throws(() => decryptApiKey(encrypted, 'another-workspace', env), /administrator/);
  assert.throws(() => decryptApiKey(`${encrypted}tamper`, workspaceId, env), /administrator/);
});

test('enterprise requests use short-lived signatures and preserve the gateway /api prefix', async () => {
  const adapter = createPostizAdapter({ env, fetchImpl: async (url, options) => {
    assert.equal(String(url), 'https://social.example/api/enterprise/create-user');
    const { payload } = await jwtVerify(JSON.parse(options.body).params, new TextEncoder().encode(env.POSTIZ_JWT_SECRET));
    assert.equal(payload.id, workspaceId);
    assert.equal(payload.exp - payload.iat, 120);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ id: 'org', apiKey: 'private' }));
  } });
  assert.equal((await adapter.provision(workspaceId)).id, 'org');
});

test('upstream errors never disclose credentials or raw response bodies', async () => {
  const adapter = createPostizAdapter({ env, fetchImpl: async () => new Response('token=secret', { status: 403 }) });
  await assert.rejects(adapter.channels('secret'), error => error.status === 502 && !error.message.includes('secret'));
});

test('cross-tenant membership is denied before service access', async () => {
  await assert.rejects(resolveTenantContext({ token: 'session', workspaceId, sessionLookup: async () => ({ user_id: 'user' }), membershipLookup: async () => null }), /Workspace access denied/);
});

test('members and read-only impersonation cannot connect or publish', () => {
  assert.throws(() => requireSocialWrite({ workspace: { role: 'member' } }), error => error.status === 403);
  assert.throws(() => requireSocialWrite({ ...tenant, impersonation: { readOnly: true } }), error => error.status === 403);
});

test('concurrent activation provisions one Postiz organization', async () => {
  const f = fixture(); f.clear();
  const results = await Promise.allSettled([f.service.activate(tenant), f.service.activate(tenant)]);
  assert.equal(f.calls.provision, 1);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  assert.equal(f.workspace().status, 'ready');
  await f.service.activate(tenant);
  assert.equal(f.calls.provision, 1);
});

test('ambiguous provisioning is held for reconciliation, never retried blindly', async () => {
  let calls = 0;
  const f = fixture({ provision: async () => { calls++; throw new Error('timeout'); } }); f.clear();
  await assert.rejects(f.service.activate(tenant));
  await assert.rejects(f.service.activate(tenant), error => error.status === 409);
  assert.equal(calls, 1);
  assert.equal(f.workspace().status, 'needs_review');
});

test('duplicate submissions send once and return the original receipt', async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.service.submit(tenant, input), f.service.submit(tenant, input)]);
  assert.equal(f.calls.submit, 1);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  const retried = await f.service.submit(tenant, input);
  assert.deepEqual(retried, { posts: [{ id: 'post-1' }], type: 'draft' });
  await assert.rejects(f.service.submit(tenant, { ...input, content: 'Changed content' }), error => error.code === 'SOCIAL_REQUEST_CONFLICT');
});

test('lost post responses do not cause an automatic duplicate on retry', async () => {
  let calls = 0;
  const f = fixture({ createPost: async () => { calls++; throw new Error('timeout'); } });
  await assert.rejects(f.service.submit(tenant, input));
  await assert.rejects(f.service.submit(tenant, input), error => error.code === 'SOCIAL_SUBMISSION_PENDING');
  assert.equal(calls, 1);
});

test('foreign channels and media are rejected before upload or scheduling', async () => {
  const f = fixture();
  await assert.rejects(f.service.submit(tenant, { ...input, channelId: 'other-tenant-channel' }), error => error.status === 403);
  await assert.rejects(f.service.submit(tenant, { ...input, assetId: workspaceId }), error => error.status === 404);
  assert.equal(f.calls.submit, 0); assert.equal(f.calls.upload, 0);
});

test('status returns only display fields, never upstream credentials', async () => {
  const result = await fixture().service.status(tenant);
  assert.equal(result.channels[0].name, 'Creator');
  assert.ok(!JSON.stringify(result).includes('never-return-this'));
  assert.ok(!JSON.stringify(result).includes('org-key'));
});

test('schedule validates the date and rejects publish-now and client media URLs', () => {
  assert.throws(() => validateSocialPost({ ...input, type: 'now' }));
  assert.throws(() => validateSocialPost({ ...input, type: 'schedule', date: 'invalid' }));
  assert.throws(() => validateSocialPost({ ...input, assetId: 'https://internal.test' }));
  assert.throws(() => validateSocialPost({ ...input, type: 'schedule', date: new Date().toISOString() }));
});

test('cancel only reaches Postiz for a queued post owned by the current workspace', async () => {
  const deleted = [];
  const f = fixture({ posts: async () => ({ posts: [{ id: 'mine', state: 'QUEUE' }, { id: 'published', state: 'PUBLISHED' }] }),
    deletePost: async (_key, id) => { deleted.push(id); } });
  await assert.rejects(f.service.cancel(tenant, 'other-tenant'), error => error.status === 409);
  await assert.rejects(f.service.cancel(tenant, 'published'), error => error.status === 409);
  assert.deepEqual(await f.service.cancel(tenant, 'mine'), { removed: true });
  assert.deepEqual(deleted, ['mine']);
});
