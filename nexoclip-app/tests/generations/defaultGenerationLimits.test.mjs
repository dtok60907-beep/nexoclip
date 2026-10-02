import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:1/test';

const { getPool } = await import('../../src/db/pool.js');
const { registerUser, loginWithGoogle } = await import('../../src/services/authService.js');
const { insertDefaultGenerationLimits } = await import('../../src/repositories/generationLimitsRepository.js');
const { DEFAULT_WORKSPACE_GENERATION_LIMITS } = await import('../../src/services/generationLimitDefaults.js');

test('default limits constant holds the proposed values', () => {
  assert.deepEqual({ ...DEFAULT_WORKSPACE_GENERATION_LIMITS }, {
    rate_limit: 10,
    rate_window_seconds: 60,
    max_concurrent: 2,
    budget_credits: 3000,
    budget_period: 'calendar_month',
  });
});

test('insertDefaultGenerationLimits inserts idempotently with ON CONFLICT DO NOTHING', async () => {
  const calls = [];
  const client = { async query(text, values) { calls.push({ text, values }); return { rows: [] }; } };
  const row = await insertDefaultGenerationLimits(client, 'w1', DEFAULT_WORKSPACE_GENERATION_LIMITS);
  assert.equal(row, null);
  assert.match(calls[0].text, /INSERT INTO workspace_generation_limits/);
  assert.match(calls[0].text, /ON CONFLICT \(workspace_id\) DO NOTHING/);
  assert.deepEqual(calls[0].values, ['w1', 10, 60, 2, 3000, 'calendar_month']);
});

// Fake transactional client: statements are buffered and only "persisted" on COMMIT.
function installFakeClient({ failOn } = {}) {
  const persisted = [];
  const log = [];
  let pending = [];
  const client = {
    async query(text, values) {
      const sql = String(text).trim();
      log.push(sql.split(/\s+/)[0]);
      if (/^BEGIN/.test(sql)) { pending = []; return { rows: [] }; }
      if (/^COMMIT/.test(sql)) { persisted.push(...pending); pending = []; return { rows: [] }; }
      if (/^ROLLBACK/.test(sql)) { pending = []; return { rows: [] }; }
      if (failOn && failOn.test(sql)) throw new Error('boom');
      if (/FROM users/.test(sql)) return { rows: [] };
      if (/INSERT INTO users/.test(sql)) return { rows: [{ id: 'u1', email: 'a@b.co', display_name: null }] };
      if (/INSERT INTO workspaces/.test(sql)) return { rows: [{ id: 'ws1', name: 'n', slug: 's' }] };
      if (/INSERT INTO workspace_generation_limits/.test(sql)) {
        pending.push({ table: 'limits', values });
        return { rows: [] };
      }
      if (/FROM credit_ledger/.test(sql)) return { rows: [] };
      if (/INSERT INTO credit_accounts|FOR UPDATE|UPDATE credit_accounts/.test(sql)) {
        return { rows: [{ workspace_id: 'ws1', balance: '0' }] };
      }
      if (/INSERT INTO credit_ledger/.test(sql)) return { rows: [{ id: 'l1' }] };
      if (/INSERT INTO sessions|INSERT INTO user_sessions/.test(sql)) return { rows: [{ id: 's1' }] };
      return { rows: [{ id: 'x' }] };
    },
    release() {},
  };
  getPool().connect = async () => client;
  return { persisted, log };
}

test('registerUser inserts default limits for the new workspace inside the transaction', async () => {
  const { persisted, log } = installFakeClient();
  await registerUser({ email: 'a@b.co', password: 'correct horse battery', displayName: 'A' });
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0].values, ['ws1', 10, 60, 2, 3000, 'calendar_month']);
  assert.ok(log.indexOf('INSERT') > log.indexOf('BEGIN'));
  assert.equal(log.at(-1), 'COMMIT');
});

test('loginWithGoogle inserts default limits for a new user workspace', async () => {
  const { persisted } = installFakeClient();
  await loginWithGoogle({ email: 'g@b.co', displayName: 'G' });
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0].values, ['ws1', 10, 60, 2, 3000, 'calendar_month']);
});

test('a failure after the limits insert rolls back and leaves no row', async () => {
  const { persisted, log } = installFakeClient({ failOn: /INSERT INTO credit_ledger/ });
  await assert.rejects(registerUser({ email: 'a@b.co', password: 'correct horse battery', displayName: 'A' }), /boom/);
  assert.equal(persisted.length, 0);
  assert.equal(log.at(-1), 'ROLLBACK');
});
