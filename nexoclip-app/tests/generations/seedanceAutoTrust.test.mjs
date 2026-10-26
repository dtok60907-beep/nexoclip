import test from 'node:test';
import assert from 'node:assert/strict';

const { createSeedanceAutoTrust, realPersonContentIndexes } = await import('../../src/services/seedanceAutoTrust.js');

// Loans kept in memory; the SQL is matched by what each statement does.
function fakePool({ jobs = {}, clock = () => Date.now() } = {}) {
  const loans = [];
  return {
    loans,
    async query(sql, values) {
      const text = sql.trim();
      if (/^INSERT INTO byteplus_trust_loans/.test(text)) {
        const [generationId, workspaceId, assetId] = values;
        const held = loans.find((l) => l.generationId === generationId && l.assetId === assetId);
        if (held) held.releasedAt = null;
        else loans.push({ generationId, workspaceId, assetId, createdAt: clock(), releasedAt: null });
        return { rows: [] };
      }
      if (/^UPDATE byteplus_trust_loans SET released_at/.test(text)) {
        const held = loans.filter((l) => l.generationId === values[0] && l.releasedAt === null);
        for (const loan of held) loan.releasedAt = clock();
        return { rows: held.map((l) => ({ workspace_id: l.workspaceId, local_asset_id: l.assetId })) };
      }
      if (/^SELECT 1 FROM byteplus_trust_loans/.test(text)) {
        return { rows: loans.filter((l) => l.workspaceId === values[0] && l.assetId === values[1]).map(() => ({})) };
      }
      if (/SELECT DISTINCT l.generation_id/.test(text)) {
        const ids = [...new Set(loans.filter((l) => l.releasedAt === null && !['queued', 'running', 'processing'].includes(jobs[l.generationId])).map((l) => l.generationId))];
        return { rows: ids.map((id) => ({ generation_id: id })) };
      }
      if (/GROUP BY workspace_id, local_asset_id/.test(text)) {
        const before = new Date(values[0]).getTime();
        const keys = [...new Set(loans.map((l) => `${l.workspaceId}|${l.assetId}`))];
        const rows = keys.map((k) => loans.filter((l) => `${l.workspaceId}|${l.assetId}` === k))
          .filter((group) => group.every((l) => l.releasedAt !== null) && Math.max(...group.map((l) => l.releasedAt)) < before)
          .slice(0, values[1])
          .map((group) => ({ workspace_id: group[0].workspaceId, local_asset_id: group[0].assetId }));
        return { rows };
      }
      if (/^DELETE FROM byteplus_trust_loans/.test(text)) {
        const [workspaceId, assetId] = values;
        if (loans.some((l) => l.workspaceId === workspaceId && l.assetId === assetId && l.releasedAt === null)) return { rows: [] };
        for (const loan of loans.filter((l) => l.workspaceId === workspaceId && l.assetId === assetId)) loans.splice(loans.indexOf(loan), 1);
        return { rows: [] };
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

test('a borrowed trust stays after its generation and the next generation reuses it without a write', async () => {
  const pool = fakePool();
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.calls.started.push([assetId]); trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {} });

  await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('job-1');
  await auto.borrow({ generationId: 'job-2', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('job-2');

  assert.equal(trust.calls.started.length, 1);
  assert.deepEqual(trust.calls.deleted, []);
});

test('sweep gives back loans of generations that ended, and removes trusts unused for the keep time', async () => {
  let clock = Date.parse('2026-10-23T00:00:00Z');
  const pool = fakePool({ jobs: { done: 'failed', live: 'running' }, clock: () => clock });
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {}, now: () => clock, keepTrustMs: 1000 });
  await auto.borrow({ generationId: 'done', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.borrow({ generationId: 'live', workspaceId: 'w1', assetIds: ['a2'] });

  assert.equal(await auto.sweep(), 1);
  assert.deepEqual(trust.calls.deleted, []); // a1 was released just now
  clock += 5000;
  await auto.sweep();
  assert.deepEqual(trust.calls.deleted, ['a1']);
  assert.deepEqual(pool.loans.map((l) => l.generationId), ['live']);
});

test('a trust in use is never removed by the sweep', async () => {
  let clock = Date.parse('2026-10-23T00:00:00Z');
  const pool = fakePool({ jobs: { old: 'succeeded', live: 'running' }, clock: () => clock });
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {}, now: () => clock, keepTrustMs: 1000 });
  await auto.borrow({ generationId: 'old', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('old');
  clock += 5000;
  await auto.borrow({ generationId: 'live', workspaceId: 'w1', assetIds: ['a1'] });

  await auto.sweep();
  assert.deepEqual(trust.calls.deleted, []);
});

test('a retried generation holds its released loan again', async () => {
  let clock = Date.parse('2026-10-23T00:00:00Z');
  const pool = fakePool({ jobs: { job: 'running' }, clock: () => clock });
  const trust = fakeTrust();
  trust.startTrust = async (_w, assetId) => { trust.states[assetId] = 'active'; return { status: 'active' }; };
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async () => {}, now: () => clock, keepTrustMs: 1000 });
  await auto.borrow({ generationId: 'job', workspaceId: 'w1', assetIds: ['a1'] });
  await auto.release('job');
  clock += 5000;
  await auto.borrow({ generationId: 'job', workspaceId: 'w1', assetIds: ['a1'] });

  await auto.sweep();
  assert.deepEqual(trust.calls.deleted, []);
});

test('a quota error waits for the next minute before trying again', async () => {
  const trust = fakeTrust();
  let starts = 0;
  trust.startTrust = async (_w, assetId) => {
    starts += 1;
    if (starts === 1) throw Object.assign(new Error('unavailable'), { retryable: true, status: 429, providerCode: 'QuotaWriteQPMExceeded' });
    trust.states[assetId] = 'active';
    return { status: 'active' };
  };
  const waits = [];
  const auto = createSeedanceAutoTrust({ pool: fakePool(), trustService: trust, sleep: async (ms) => { waits.push(ms); }, retryDelaysMs: [10, 20], quotaDelayMs: 65_000, log: { error() {} } });

  assert.deepEqual(await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] }), []);
  assert.deepEqual(waits, [65_000]);
});

test('borrow tries again when BytePlus is briefly unavailable', async () => {
  const pool = fakePool();
  const trust = fakeTrust();
  let starts = 0;
  trust.startTrust = async (_w, assetId) => {
    starts += 1;
    if (starts < 3) throw Object.assign(new Error('BytePlus Assets API is temporarily unavailable.'), { code: 'BYTEPLUS_ASSETS_UNAVAILABLE', retryable: true });
    trust.states[assetId] = 'active';
    return { status: 'active' };
  };
  const waits = [];
  const auto = createSeedanceAutoTrust({ pool, trustService: trust, sleep: async (ms) => { waits.push(ms); }, retryDelaysMs: [10, 20, 30], log: { error() {} } });

  assert.deepEqual(await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] }), []);
  assert.equal(starts, 3);
  assert.deepEqual(waits, [10, 20]);
});

test('borrow gives up after its retries, and at once on an error that is not transient', async () => {
  const unavailable = fakeTrust();
  unavailable.startTrust = async () => { throw Object.assign(new Error('unavailable'), { retryable: true }); };
  let waits = 0;
  const auto = createSeedanceAutoTrust({ pool: fakePool(), trustService: unavailable, sleep: async () => { waits += 1; }, retryDelaysMs: [1, 1], log: { error() {} } });
  assert.deepEqual(await auto.borrow({ generationId: 'job-1', workspaceId: 'w1', assetIds: ['a1'] }), ['a1']);
  assert.equal(waits, 2);

  const refused = fakeTrust();
  refused.startTrust = async () => { throw Object.assign(new Error('bad image'), { retryable: false }); };
  waits = 0;
  const strict = createSeedanceAutoTrust({ pool: fakePool(), trustService: refused, sleep: async () => { waits += 1; }, retryDelaysMs: [1, 1], log: { error() {} } });
  assert.deepEqual(await strict.borrow({ generationId: 'job-2', workspaceId: 'w1', assetIds: ['a1'] }), ['a1']);
  assert.equal(waits, 0);
});
