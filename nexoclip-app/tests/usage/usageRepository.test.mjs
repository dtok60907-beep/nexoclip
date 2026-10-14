import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsageSummary, listUsageHistory } from '../../src/repositories/usageRepository.js';

function pool() {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows: [], rowCount: 0 }; } };
}

test('my usage filters by workspace and authenticated actor', async () => {
  const db = pool();
  await listUsageHistory(db, { workspaceId: 'w1', userId: 'u1', scope: 'me', page: 1, pageSize: 25 });
  assert.match(db.calls[0].text, /gj\.workspace_id = \$1/);
  assert.match(db.calls[0].text, /gj\.created_by_user_id = \$2/);
  assert.deepEqual(db.calls[0].values.slice(0, 2), ['w1', 'u1']);
  assert.doesNotMatch(db.calls[0].text, /raw_usage/);
});

test('workspace usage omits actor filter and uses canonical settlement charge', async () => {
  const db = pool();
  await getUsageSummary(db, { workspaceId: 'w1', userId: 'u1', scope: 'workspace', periodStart: new Date('2026-09-01T00:00:00Z') });
  assert.doesNotMatch(db.calls[0].text, /created_by_user_id =/);
  assert.match(db.calls[0].text, /settlement_status = 'captured'/);
  assert.match(db.calls[0].text, /credit_ledger/);
  assert.match(db.calls[0].text, /reservation_ledger_id/);
  assert.match(db.calls[0].text, /generation_capture/);
  assert.match(db.calls[0].text, /settlement_status IN \('released', 'refunded'\)/);
  assert.doesNotMatch(db.calls[0].text, /pu\.actual_cost/);
});

test('usage includes the LLM, audio and video-analysis calls billed to the ledger without a job', async () => {
  const db = pool();
  await listUsageHistory(db, { workspaceId: 'w1', userId: 'u1', scope: 'me', page: 1, pageSize: 25 });
  const { text, values } = db.calls[0];
  assert.match(text, /UNION ALL/);
  assert.match(text, /_\(text\|audio\|video_analysis\)\$/);
  // my usage: the charge names me, or an older one without a user while I own the workspace
  assert.match(text, /c\.metadata->>'userId' = \$3/);
  assert.match(text, /m\.role = 'owner'/);
  assert.deepEqual(values.slice(0, 3), ['w1', 'u1', 'u1']);
});

test('the monthly summary breaks credits down per kind and source', async () => {
  const db = pool();
  await getUsageSummary(db, { workspaceId: 'w1', userId: 'u1', scope: 'workspace', periodStart: new Date('2026-09-01T00:00:00Z') });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[1].text, /GROUP BY 1, 2/);
  assert.match(db.calls[1].text, /AS source/);
});
