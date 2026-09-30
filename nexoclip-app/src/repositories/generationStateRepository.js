import { transitionGeneration } from '../queue/generationStateMachine.js';

function fence({ attempt, claimToken }) {
  if (!Number.isInteger(Number(attempt)) || !claimToken) throw new TypeError('attempt and claimToken are required');
  return [Number(attempt), claimToken];
}

export async function transitionGenerationJob(pool, { workspaceId, generationId, from, to, timeoutAt = null, attempt, claimToken }) {
  transitionGeneration(from, to);
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  const result = await pool.query(
    `UPDATE generation_jobs
     SET status = $4, timeout_at = $5, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status = $3
       AND attempt_count = $6 AND claim_token = $7
     RETURNING id, workspace_id, status, attempt_count, max_attempts, next_attempt_at, timeout_at`,
    [workspaceId, generationId, from, to, timeoutAt, claimedAttempt, token],
  );
  return result.rows[0] || null;
}

// A worker that dies mid-job (e.g. killed by a deploy) leaves it 'running'
// forever. Expired jobs are re-queued so another worker picks them up; jobs
// whose lease ran out long ago are failed instead of silently re-run (and
// re-billed) days later. `graceMs` keeps a still-alive worker that is just
// finishing from racing its own recovery.
export async function recoverExpiredGenerationJobs(pool, {
  now = new Date().toISOString(), kind = null, graceMs = 0, staleAfterMs = null,
} = {}) {
  const nowMs = new Date(now).getTime();
  const cutoff = new Date(nowMs - graceMs).toISOString();
  const staleBefore = staleAfterMs == null ? null : new Date(nowMs - staleAfterMs).toISOString();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query(
      `SELECT id, workspace_id, attempt_count, max_attempts, reservation_ledger_id, timeout_at
       FROM generation_jobs
       WHERE status IN ('running', 'processing') AND timeout_at <= $1
         AND ($2::text IS NULL OR kind = $2::text)
       FOR UPDATE SKIP LOCKED`, [cutoff, kind],
    );
    const recovered = [];
    for (const job of expired.rows) {
      const stale = staleBefore !== null && new Date(job.timeout_at).getTime() <= new Date(staleBefore).getTime();
      const exhausted = stale || Number(job.attempt_count) >= Number(job.max_attempts);
      await client.query(
        stale
          ? `UPDATE generation_jobs SET status = 'failed', error = '{"code":"GENERATION_LEASE_STALE"}'::jsonb,
               timeout_at = NULL, claim_token = NULL, queue_published_at = NULL, queue_claimed_at = NULL, finished_at = now(), updated_at = now()
             WHERE id = $1 AND workspace_id = $2`
          : exhausted
          ? `UPDATE generation_jobs SET status = 'failed', error = '{"code":"GENERATION_LEASE_EXPIRED"}'::jsonb,
               timeout_at = NULL, claim_token = NULL, queue_published_at = NULL, queue_claimed_at = NULL, finished_at = now(), updated_at = now()
             WHERE id = $1 AND workspace_id = $2 AND attempt_count >= max_attempts`
          : `UPDATE generation_jobs SET status = 'queued', error = '{"code":"GENERATION_LEASE_EXPIRED","retryable":true}'::jsonb,
               timeout_at = NULL, claim_token = NULL, queue_published_at = NULL, queue_claimed_at = NULL, next_attempt_at = now(), updated_at = now()
             WHERE id = $1 AND workspace_id = $2`,
        [job.id, job.workspace_id],
      );
      recovered.push({id: job.id, workspaceId: job.workspace_id, status: exhausted ? 'failed' : 'queued', reservationLedgerId: job.reservation_ledger_id});
    }
    await client.query('COMMIT');
    return recovered;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function completeGenerationJob(pool, { workspaceId, generationId, provider, result = {}, attempt, claimToken, providerRequestId = null }) {
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  // Only touch provider_request_id when completion knows one; an absent id
  // must leave the column as it is.
  const values = [workspaceId, generationId, JSON.stringify(result || {}), provider || null, claimedAttempt, token];
  if (providerRequestId) values.push(providerRequestId);
  const updated = await pool.query(
    `UPDATE generation_jobs
     SET result = $3::jsonb, provider = COALESCE($4, provider),${providerRequestId ? `
         provider_request_id = COALESCE(provider_request_id, $7),` : ''} updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status = 'running'
       AND attempt_count = $5 AND claim_token = $6
     RETURNING id, workspace_id, status, result, provider, provider_request_id`,
    values,
  );
  return updated.rows[0] || null;
}

// Record the provider's task id as soon as the provider accepts the job, so a
// worker that restarts can resume polling it instead of submitting (and
// paying for) the same generation again.
export async function recordGenerationProviderRequest(pool, { generationId, claimToken, provider, providerRequestId }) {
  const updated = await pool.query(
    `UPDATE generation_jobs
     SET provider = COALESCE($3, provider), provider_request_id = $4, updated_at = now()
     WHERE id = $1 AND claim_token = $2 AND status IN ('running', 'processing')
     RETURNING id`,
    [generationId, claimToken, provider || null, providerRequestId],
  );
  return updated.rows.length > 0;
}

export async function retryGenerationJob(pool, { workspaceId, generationId, attempt, claimToken, nextAttemptAt, error }) {
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  const result = await pool.query(
    `UPDATE generation_jobs SET status = 'queued', next_attempt_at = $3, error = $4::jsonb,
         timeout_at = NULL, claim_token = NULL, queue_published_at = NULL, queue_claimed_at = NULL, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status IN ('running', 'processing')
       AND attempt_count = $5 AND claim_token = $6 AND attempt_count < max_attempts
     RETURNING id, workspace_id, status, attempt_count, max_attempts, next_attempt_at`,
    [workspaceId, generationId, nextAttemptAt, JSON.stringify(error || {}), claimedAttempt, token],
  );
  return result.rows[0] || null;
}

export async function recordGenerationProgress(pool, { workspaceId, generationId, progress, attempt, claimToken }) {
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  const result = await pool.query(
    `UPDATE generation_jobs SET progress = $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status IN ('running', 'processing')
       AND attempt_count = $4 AND claim_token = $5
     RETURNING id, workspace_id, status, progress`,
    [workspaceId, generationId, JSON.stringify(progress || {}), claimedAttempt, token],
  );
  return result.rows[0] || null;
}

export async function recordGenerationProgressById(pool, { generationId, progress, attempt, claimToken }) {
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  const result = await pool.query(
    `UPDATE generation_jobs SET progress = $2::jsonb, updated_at = now()
     WHERE id = $1 AND status IN ('running', 'processing') AND attempt_count = $3 AND claim_token = $4
     RETURNING id, workspace_id, status, progress`,
    [generationId, JSON.stringify(progress || {}), claimedAttempt, token],
  );
  return result.rows[0] || null;
}

export async function failGenerationJob(pool, { workspaceId, generationId, error, attempt, claimToken }) {
  const [claimedAttempt, token] = fence({ attempt, claimToken });
  const result = await pool.query(
    `UPDATE generation_jobs SET status = 'failed', error = $3::jsonb, finished_at = now(), timeout_at = NULL, claim_token = NULL, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status IN ('running', 'processing')
       AND attempt_count = $4 AND claim_token = $5
     RETURNING id, workspace_id, status, attempt_count, max_attempts`,
    [workspaceId, generationId, JSON.stringify(error || {}), claimedAttempt, token],
  );
  return result.rows[0] || null;
}
