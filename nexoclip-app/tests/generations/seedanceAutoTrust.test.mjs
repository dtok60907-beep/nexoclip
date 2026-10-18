import test from 'node:test';
import assert from 'node:assert/strict';

const { createSeedanceAutoTrust, realPersonContentIndexes } = await import('../../src/services/seedanceAutoTrust.js');

// Loans kept in memory; the SQL is matched by what each statement does.
function fakePool({ jobs = {} } = {}) {
  const loans = [];
  return {
    loans,
    async query(sql, values) {
      if (/^INSERT INTO byteplus_trust_loans/.test(sql.trim())) {
        const [generationId, workspaceId, assetId] = values;
        if (!loans.some((l) => l.generationId === generationId && l.assetId === assetId)) loans.push({ generationId, workspaceId, assetId, createdAt: Date.now() });
        return { rows: [] };
      }
      if (/^DELETE FROM byteplus_trust_loans/.test(sql.trim())) {
        const gone = loans.filter((l) => l.generationId === values[0]);
        for (const loan of gone) loans.splice(loans.indexOf(loan), 1);
        return { rows: gone.map((l) => ({ workspace_id: l.workspaceId, local_asset_id: l.assetId })) };
      }
      if (/^SELECT 1 FROM byteplus_trust_loans/.test(sql.trim())) {
        return { rows: loans.filter((l) => l.workspaceId === values[0] && l.assetId === values[1]).map(() => ({})) };
      }
      if (/SELECT DISTINCT l.generation_id/.test(sql)) {
        const ids = [...new Set(loans.filter((l) => !['queued', 'running', 'processing'].includes(jobs[l.generationId])).map((l) => l.generationId))];
        return { rows: ids.map((id) => ({ generation_id: id })) };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

function fakeTrust(initial = {}) {
  const states = { ...initial };
  const calls = { started: [], deleted: [] };
  return {
    calls,
    states,
    async getTrust(_workspaceId, assetId) { return { status: states[assetId] || 'not_trusted' }; },
    async startTrust(_workspaceId, assetId, scope) {
      calls.started.push([assetId, scope]);
      states[assetId] = 'processing';
      return { status: 'processing' };
    },
    async deleteTrust(_workspaceId, assetId) { calls.deleted.push(assetId); delete states[assetId]; return { status: 'not_trusted' }; },
  };
}

test('reads the refused content positions out of a BytePlus real-person refusal', () => {
  assert.deepEqual(realPersonContentIndexes(new Error("The request failed because the input image 'content[1]' 'content[3]' 'content[3]' may contain real person. Request id: x")), [1, 3]);
  assert.equal(realPersonContentIndexes(new Error('the parameter image pixel count ... content[12]')), null);
  assert.equal(realPersonContentIndexes(null), null);
});

test('borrow trusts an untrusted image in the shared workspace scope and waits until it is active', async () => {
  const pool = fakePool();
  const trust = fakeTrust();
  let polls = 0;
  trust.getTrust = async (_w, assetId) => {
    polls += 1;
    if (polls > 2) trust.states[assetId] = 'active';
    return { status: trust.states[assetId] || 'not_trusted' };
  };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {} });

  const failed = await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] });

  assert.deepEqual(failed, []);
  assert.deepEqual(trust.calls.started, [['a1', 'workspace']]);
  assert.equal(pool.loans.length, 1);
});

test('borrow reports an image that never becomes active', async () => {
  let clock = 0;
  const auto = createSeedanceAutoTrust({
    pool: fakePool(), trustService: fakeTrust(), sleep: async (ms) => { clock += ms; }, now: () => clock, timeoutMs: 10_000,
  });

  assert.deepEqual(await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] }), ['a1']);
});

test('an image someone trusted on purpose is used but never borrowed or removed', async () => {
  const pool = fakePool();
  const trust = fakeTrust({ a1: 'active' });
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {} });

  await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('job-1');

  assert.equal(pool.loans.length, 0);
  assert.deepEqual(trust.calls.started, []);
  assert.deepEqual(trust.calls.deleted, []);
});

test('an image two generations borrowed is removed only after both release it', async () => {
  const pool = fakePool();
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {} });

  await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.borrow({ generationId: 'job-2', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('job-1');
  assert.deepEqual(trust.calls.deleted, []);
  await auto.release('job-2');
  assert.deepEqual(trust.calls.deleted, ['a1']);
});

test('sweep gives back loans of generations that ended and keeps running ones', async () => {
  const pool = fakePool({ jobs: { done: 'failed', live: 'running' } });
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {} });
  await auto.borrow({ generationId: 'done', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.borrow({ generationId: 'live', workspaceId: 'w1', assetIds: ['a2'] });

  assert.equal(await auto.sweep(), 1);
  assert.deepEqual(trust.calls.deleted, ['a1']);
  assert.deepEqual(pool.loans.map((l) => l.generationId), ['live']);
});
