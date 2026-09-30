import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionGenerationJob,
  failGenerationJob,
  retryGenerationJob,
  recordGenerationProgress,
  recoverExpiredGenerationJobs,
  completeGenerationJob,
  recordGenerationProviderRequest,
} from '../../src/repositories/generationStateRepository.js';

function poolFor(row = { id: 'g1', workspace_id: 'w1', status: 'running', attempt_count: 1, max_attempts: 3 }) {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows: [row] }; } };
}

test('transitions a job with workspace scope, timeout metadata and claim fencing', async () => {
  const pool = poolFor();
  await transitionGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', from: 'running', to: 'processing', timeoutAt: '2026-04-10T00:00:00Z', attempt: 1, claimToken: 'c1' });
  assert.match(pool.calls[0].text, /workspace_id = \$1/);
  assert.match(pool.calls[0].text, /status = \$4/);
  assert.match(pool.calls[0].text, /attempt_count = \$6 AND claim_token = \$7/);
  assert.deepEqual(pool.calls[0].values, ['w1', 'g1', 'running', 'processing', '2026-04-10T00:00:00Z', 1, 'c1']);
});

test('state writes refuse to run without the current attempt and claim token', async () => {
  const pool = poolFor();
  await assert.rejects(transitionGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', from: 'running', to: 'processing' }), /attempt and claimToken are required/);
  await assert.rejects(failGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', error: {} }), /attempt and claimToken are required/);
  assert.equal(pool.calls.length, 0);
});

test('records retry metadata and returns the job to queued for the current claim', async () => {
  const pool = poolFor();
  await retryGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', attempt: 2, claimToken: 'c2', nextAttemptAt: '2026-04-10T00:01:00Z', error: { code: 'PROVIDER_UNAVAILABLE', retryable: true } });
  assert.match(pool.calls[0].text, /next_attempt_at = \$3/);
  assert.match(pool.calls[0].text, /attempt_count = \$5 AND claim_token = \$6 AND attempt_count < max_attempts/);
  assert.deepEqual(pool.calls[0].values, ['w1', 'g1', '2026-04-10T00:01:00Z', '{"code":"PROVIDER_UNAVAILABLE","retryable":true}', 2, 'c2']);
});

test('stores structured progress under workspace, job and claim scope', async () => {
  const pool = poolFor();
  await recordGenerationProgress(pool, {
    workspaceId: 'w1', generationId: 'g1', attempt: 1, claimToken: 'c1',
    progress: { stage: 'rendering', message: 'Frame 1' },
  });
  assert.match(pool.calls[0].text, /workspace_id = \$1/);
  assert.match(pool.calls[0].text, /progress = \$3::jsonb/);
  assert.deepEqual(pool.calls[0].values, ['w1', 'g1', '{"stage":"rendering","message":"Frame 1"}', 1, 'c1']);
});

test('returns a retry to queued state and clears publication fields', async () => {
  const pool = poolFor();
  await retryGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', attempt: 2, claimToken: 'c2', nextAttemptAt: '2026-04-10T00:01:00Z', error: {} });
  assert.match(pool.calls[0].text, /queue_published_at = NULL/);
  assert.match(pool.calls[0].text, /queue_claimed_at = NULL/);
  assert.match(pool.calls[0].text, /claim_token = NULL/);
});

test('requeues expired running claims with cleared publication markers and terminally fails exhausted claims', async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({text, values});
      if (text === 'BEGIN' || text === 'COMMIT') return {rows: []};
      if (/FOR UPDATE SKIP LOCKED/.test(text)) return {rows: [
        {id: 'retry', workspace_id: 'w1', attempt_count: 1, max_attempts: 3, reservation_ledger_id: null},
        {id: 'exhausted', workspace_id: 'w2', attempt_count: 3, max_attempts: 3, reservation_ledger_id: 'ledger'},
      ]};
      return {rows: []};
    }, release() {},
  };
  const recovered = await recoverExpiredGenerationJobs({connect: async () => client}, {now: '2026-08-14T00:00:00.000Z'});
  assert.deepEqual(recovered, [
    {id: 'retry', workspaceId: 'w1', status: 'queued', reservationLedgerId: null},
    {id: 'exhausted', workspaceId: 'w2', status: 'failed', reservationLedgerId: 'ledger'},
  ]);
  assert.match(calls.find((call) => /FOR UPDATE SKIP LOCKED/.test(call.text)).text, /timeout_at <= \$1/);
  assert.match(calls.find((call) => /SET status = 'queued'/.test(call.text)).text, /queue_published_at = NULL/);
  assert.match(calls.find((call) => /SET status = 'failed'/.test(call.text)).text, /attempt_count >= max_attempts/);
});

test('persists sanitized completion metadata and the provider task id before transitioning succeeded', async () => {
  const pool = poolFor();
  await completeGenerationJob(pool, {
    workspaceId: 'w1', generationId: 'g1', provider: 'vimax', providerRequestId: 'runtime-g1',
    result: {generated: ['workspace/clip.mp4']}, attempt: 1, claimToken: 'c1',
  });
  assert.match(pool.calls[0].text, /result = \$3::jsonb/);
  assert.match(pool.calls[0].text, /provider_request_id = COALESCE\(provider_request_id, \$7\)/);
  assert.match(pool.calls[0].text, /WHERE workspace_id = \$1/);
  assert.equal(pool.calls[0].values[6], 'runtime-g1');
});

test('marks an exhausted job failed without exposing provider details', async () => {
  const pool = poolFor();
  await failGenerationJob(pool, { workspaceId: 'w1', generationId: 'g1', error: { code: 'PROVIDER_UNAVAILABLE', message: 'safe' }, attempt: 3, claimToken: 'c3' });
  assert.match(pool.calls[0].text, /status = 'failed'/);
  assert.deepEqual(pool.calls[0].values, ['w1', 'g1', '{"code":"PROVIDER_UNAVAILABLE","message":"safe"}', 3, 'c3']);
});

test('expired recovery can be scoped by kind, waits a grace period and fails stale jobs', async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (/FOR UPDATE SKIP LOCKED/.test(text)) return { rows: [
        { id: 'fresh', workspace_id: 'w1', attempt_count: 1, max_attempts: 3, reservation_ledger_id: 'l1', timeout_at: '2026-08-13T23:50:00.000Z' },
        { id: 'stale', workspace_id: 'w1', attempt_count: 1, max_attempts: 3, reservation_ledger_id: 'l2', timeout_at: '2026-08-10T00:00:00.000Z' },
      ] };
      return { rows: [] };
    }, release() {},
  };
  const recovered = await recoverExpiredGenerationJobs({ connect: async () => client }, {
    now: '2026-08-14T00:00:00.000Z', kind: 'video', graceMs: 2 * 60 * 1000, staleAfterMs: 6 * 60 * 60 * 1000,
  });
  const select = calls.find((call) => /FOR UPDATE SKIP LOCKED/.test(call.text));
  assert.deepEqual(select.values, ['2026-08-13T23:58:00.000Z', 'video']);
  assert.deepEqual(recovered.map((job) => [job.id, job.status]), [['fresh', 'queued'], ['stale', 'failed']]);
  assert.ok(calls.some((call) => /GENERATION_LEASE_STALE/.test(call.text) && call.values[0] === 'stale'));
});

test('records the provider task id only for the current claim', async () => {
  const pool = { calls: [], async query(text, values) { this.calls.push({ text, values }); return { rows: [{ id: 'g1' }] }; } };
  assert.equal(await recordGenerationProviderRequest(pool, { generationId: 'g1', claimToken: 'c1', provider: 'byteplus', providerRequestId: 'cgt-1' }), true);
  assert.match(pool.calls[0].text, /claim_token = \$2/);
  assert.deepEqual(pool.calls[0].values, ['g1', 'c1', 'byteplus', 'cgt-1']);
});
