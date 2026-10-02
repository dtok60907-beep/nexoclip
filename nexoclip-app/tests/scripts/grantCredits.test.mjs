import test from 'node:test';
import assert from 'node:assert/strict';
import { grantCredits, parseArgs } from '../../scripts/grant-credits.mjs';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

// Minimal in-memory pg double that records every query.
function fakePool({ workspaces = [{ id: WS, name: 'Acme', slug: 'acme' }], balances = {}, ledger = [], budgets = {} } = {}) {
  const queries = [];
  let seq = 0;
  const client = {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      queries.push({ text, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text) || text.startsWith('SELECT pg_advisory')) return { rows: [] };
      if (text.startsWith('SELECT id, name, slug FROM workspaces')) return { rows: workspaces.filter((w) => w.id === params[0]) };
      if (text.includes('FROM credit_ledger WHERE idempotency_key = $1')) return { rows: ledger.filter((e) => e.idempotency_key === params[0]) };
      if (text.startsWith('SELECT balance FROM credit_accounts')) return { rows: params[0] in balances ? [{ balance: String(balances[params[0]]) }] : [] };
      if (text.startsWith('SELECT budget_credits')) return { rows: params[0] in budgets ? [{ budget_credits: String(budgets[params[0]]) }] : [] };
      if (text.startsWith('INSERT INTO credit_accounts')) {
        if (params[0] in balances) return { rows: [] };
        balances[params[0]] = 0;
        return { rows: [{ workspace_id: params[0], balance: '0' }] };
      }
      if (text.startsWith('SELECT workspace_id, balance, created_at, updated_at FROM credit_accounts')) return { rows: [{ workspace_id: params[0], balance: String(balances[params[0]]) }] };
      if (text.includes('workspace_id = $1 AND idempotency_key = $2')) return { rows: ledger.filter((e) => e.workspace_id === params[0] && e.idempotency_key === params[1]) };
      if (text.startsWith('UPDATE credit_accounts')) { balances[params[0]] = params[1]; return { rows: [{ workspace_id: params[0], balance: String(params[1]) }] }; }
      if (text.startsWith('INSERT INTO credit_ledger')) {
        const [workspace_id, amount, balance_after, reason, idempotency_key, metadata] = params;
        const row = { id: `entry-${++seq}`, workspace_id, amount: String(amount), balance_after: String(balance_after), reason, idempotency_key, metadata: JSON.parse(metadata) };
        ledger.push(row);
        return { rows: [row] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    release() { this.released = true; },
  };
  return { pool: { async connect() { return client; } }, client, queries, balances, ledger };
}

const writes = (queries) => queries.filter((q) => /^(BEGIN|INSERT|UPDATE|COMMIT)/.test(q.text));
const base = { workspaceId: WS, credits: 500, ref: 'TRF-001', note: 'bank transfer', operator: 'imam' };

test('parseArgs accepts a valid command', () => {
  const args = parseArgs(['--workspace', WS, '--credits', '250.5', '--ref', 'INV-2026.10:01', '--note', 'hi', '--operator', 'imam', '--dry-run', '--yes']);
  assert.deepEqual(args, { workspaceId: WS, credits: 250.5, ref: 'INV-2026.10:01', note: 'hi', operator: 'imam', dryRun: true, yes: true });
});

test('parseArgs rejects invalid input', () => {
  const ok = ['--workspace', WS, '--credits', '10', '--ref', 'R1'];
  const swap = (flag, value) => { const a = [...ok]; a[a.indexOf(flag) + 1] = value; return a; };
  assert.throws(() => parseArgs(['--credits', '10', '--ref', 'R1']), /--workspace/);
  assert.throws(() => parseArgs(swap('--workspace', 'not-a-uuid')), /UUID/);
  assert.throws(() => parseArgs(['--workspace', WS, '--ref', 'R1']), /--credits/);
  for (const bad of ['0', '-5', 'abc', '1.25', '1e3', '1000001']) assert.throws(() => parseArgs(swap('--credits', bad)), /--credits/, bad);
  assert.throws(() => parseArgs(['--workspace', WS, '--credits', '10']), /--ref/);
  for (const bad of ['has space', 'a/b', 'x'.repeat(65), "r'; DROP"]) assert.throws(() => parseArgs(swap('--ref', bad)), /--ref/, bad);
  assert.throws(() => parseArgs([...ok, '--bogus']), /Unknown argument/);
  assert.throws(() => parseArgs([...ok, '--note']), /requires a value/);
});

test('dry-run issues no writes and projects the balance', async () => {
  const f = fakePool({ balances: { [WS]: 100 } });
  const result = await grantCredits({ pool: f.pool, ...base, dryRun: true });
  assert.equal(result.status, 'dry_run');
  assert.equal(result.balanceBefore, 100);
  assert.equal(result.balanceAfter, 600);
  assert.deepEqual(writes(f.queries), []);
  assert.equal(f.ledger.length, 0);
  assert.equal(f.client.released, true);
});

test('grant appends a manual_topup ledger entry and updates the balance', async () => {
  const f = fakePool({ balances: { [WS]: 100 } });
  const result = await grantCredits({ pool: f.pool, ...base });
  assert.equal(result.status, 'granted');
  assert.equal(result.balanceBefore, 100);
  assert.equal(result.balanceAfter, 600);
  assert.equal(f.balances[WS], 600);
  assert.equal(f.ledger.length, 1);
  const entry = f.ledger[0];
  assert.equal(entry.reason, 'manual_topup');
  assert.equal(entry.idempotency_key, 'manual_topup:TRF-001');
  assert.deepEqual(entry.metadata, { credits: 500, ref: 'TRF-001', note: 'bank transfer', operator: 'imam', source: 'grant-credits-cli' });
  assert.equal(result.entry.id, entry.id);
  const texts = f.queries.map((q) => q.text);
  assert.equal(texts[0], 'BEGIN');
  assert.equal(texts.at(-1), 'COMMIT');
});

test('grant works for a workspace without a credit account yet', async () => {
  const f = fakePool();
  const result = await grantCredits({ pool: f.pool, ...base });
  assert.equal(result.balanceBefore, 0);
  assert.equal(result.balanceAfter, 500);
});

test('re-running the same ref on the same workspace is a no-op', async () => {
  const f = fakePool({ balances: { [WS]: 100 } });
  await grantCredits({ pool: f.pool, ...base });
  const before = f.queries.length;
  const again = await grantCredits({ pool: f.pool, ...base });
  assert.equal(again.status, 'already_applied');
  assert.equal(f.ledger.length, 1);
  assert.equal(f.balances[WS], 600);
  assert.equal(again.balanceAfter, 600);
  assert.equal(f.queries.slice(before).some((q) => /^(INSERT|UPDATE)/.test(q.text)), false);
});

test('a ref used on another workspace is refused', async () => {
  const f = fakePool({
    workspaces: [{ id: WS, name: 'Acme', slug: 'acme' }, { id: OTHER, name: 'Other', slug: 'other' }],
    ledger: [{ id: 'e0', workspace_id: OTHER, amount: '500', balance_after: '500', reason: 'manual_topup', idempotency_key: 'manual_topup:TRF-001' }],
  });
  await assert.rejects(grantCredits({ pool: f.pool, ...base }), (e) => e.code === 'REF_USED_ON_OTHER_WORKSPACE');
  assert.equal(f.ledger.length, 1);
  assert.equal(f.queries.some((q) => /^(INSERT|UPDATE)/.test(q.text)), false);
  assert.equal(f.queries.at(-1).text, 'ROLLBACK');
  await assert.rejects(grantCredits({ pool: f.pool, ...base, dryRun: true }), (e) => e.code === 'REF_USED_ON_OTHER_WORKSPACE');
});

test('same ref and workspace with a different amount is refused', async () => {
  const f = fakePool({
    balances: { [WS]: 500 },
    ledger: [{ id: 'e0', workspace_id: WS, amount: '500', balance_after: '500', reason: 'manual_topup', idempotency_key: 'manual_topup:TRF-001' }],
  });
  await assert.rejects(grantCredits({ pool: f.pool, ...base, credits: 700 }), (e) => e.code === 'AMOUNT_MISMATCH');
  assert.equal(f.ledger.length, 1);
  assert.equal(f.balances[WS], 500);
});

test('an unknown workspace is refused', async () => {
  const f = fakePool({ workspaces: [] });
  await assert.rejects(grantCredits({ pool: f.pool, ...base }), (e) => e.code === 'WORKSPACE_NOT_FOUND');
  assert.equal(f.queries.some((q) => /^(INSERT|UPDATE)/.test(q.text)), false);
});

test('declining the confirmation writes nothing', async () => {
  const f = fakePool({ balances: { [WS]: 100 } });
  let preview;
  const result = await grantCredits({ pool: f.pool, ...base, confirm: async (p) => { preview = p; return false; } });
  assert.equal(result.status, 'cancelled');
  assert.equal(preview.balanceAfter, 600);
  assert.equal(f.ledger.length, 0);
  assert.equal(f.balances[WS], 100);
});

test('warns when the new balance exceeds the monthly budget without changing limits', async () => {
  const f = fakePool({ balances: { [WS]: 100 }, budgets: { [WS]: 3000 } });
  const small = await grantCredits({ pool: f.pool, ...base, ref: 'A', credits: 100, dryRun: true });
  assert.deepEqual(small.warnings, []);
  const big = await grantCredits({ pool: f.pool, ...base, ref: 'B', credits: 5000 });
  assert.equal(big.warnings.length, 1);
  assert.match(big.warnings[0], /budget_credits/);
  assert.equal(f.queries.some((q) => q.text.includes('workspace_generation_limits') && !q.text.startsWith('SELECT')), false);
});
