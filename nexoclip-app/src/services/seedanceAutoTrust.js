import { createBytePlusAssetTrustService } from './byteplusAssetTrustService.js';

// Seedance refuses a reference image that shows a real person unless it is a BytePlus
// trusted asset, and names each refused image by its position in the request:
// "the input image 'content[1]' 'content[3]' may contain real person".
export function realPersonContentIndexes(error) {
  const message = String(error?.message || '');
  if (!/may contain real person/i.test(message)) return null;
  const indexes = [...message.matchAll(/content\[(\d+)\]/g)].map((match) => Number(match[1]));
  return indexes.length ? [...new Set(indexes)] : null;
}

// Auto trust shares the workspace-scoped BytePlus asset group (the account allows only a
// few dozen groups), the same scope the Director and Studio use.
const TRUST_SCOPE = 'workspace';
const POLL_MS = 3_000;
const TIMEOUT_MS = 3 * 60_000;
// A loan outlives its generation only when a worker died mid-run.
const STALE_LOAN_MS = 3 * 60 * 60_000;
// A borrowed trust stays on BytePlus after its generations end, for the next generation of
// the same image (a Director's shots reuse their characters): it is removed only once the
// image has gone unused this long.
const KEEP_TRUST_MS = 3 * 24 * 60 * 60_000;
// BytePlus Assets sometimes answers "temporarily unavailable" (a 5xx, a dropped connection).
// Wait and try again before giving up on an image: a refused image fails the whole generation.
const RETRY_DELAYS_MS = [2_000, 6_000, 15_000];
// Its write quota is per minute and small (QuotaWriteQPMExceeded after about 5 writes): when
// it runs out, wait for the next minute.
const QUOTA_DELAY_MS = 65_000;
const REMOVALS_PER_SWEEP = 3;
const isQuotaError = (error) => error?.status === 429 || String(error?.providerCode || '').startsWith('Quota');

export function createSeedanceAutoTrust({
  pool,
  trustService = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  pollMs = POLL_MS,
  timeoutMs = TIMEOUT_MS,
  retryDelaysMs = RETRY_DELAYS_MS,
  quotaDelayMs = QUOTA_DELAY_MS,
  keepTrustMs = KEEP_TRUST_MS,
  log = console,
}) {
  // Built on first use: the trust service needs BytePlus and storage configuration.
  let service = trustService;
  const trusts = () => (service ||= createBytePlusAssetTrustService({ pool }));
  async function flagged(workspaceId, assetIds) {
    if (!assetIds.length) return [];
    const result = await pool.query(
      'SELECT id FROM assets WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND byteplus_needs_trust',
      [workspaceId, assetIds],
    );
    return result.rows.map((row) => row.id);
  }

  async function markNeedsTrust(workspaceId, assetIds) {
    if (!assetIds.length) return;
    await pool.query(
      'UPDATE assets SET byteplus_needs_trust = true WHERE workspace_id = $1 AND id = ANY($2::uuid[])',
      [workspaceId, assetIds],
    );
  }

  async function waitActive(workspaceId, assetId, state) {
    const deadline = now() + timeoutMs;
    while (state?.status === 'processing' && now() < deadline) {
      await sleep(pollMs);
      state = await trusts().getTrust(workspaceId, assetId, TRUST_SCOPE);
    }
    return state?.status === 'active';
  }

  // Trusts each image for this generation and waits until BytePlus has them active.
  // Returns the asset ids that could not be trusted.
  async function borrow({ generationId, workspaceId, assetIds }) {
    const failed = [];
    for (const assetId of [...new Set(assetIds)]) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          let state = await trusts().getTrust(workspaceId, assetId, TRUST_SCOPE);
          const lent = await pool.query(
            'SELECT 1 FROM byteplus_trust_loans WHERE workspace_id = $1 AND local_asset_id = $2 LIMIT 1',
            [workspaceId, assetId],
          );
          // Active with no loans: someone trusted it on purpose (Studio, Director). Use it, never remove it.
          // Active with loans (held or released): an earlier generation's trust, borrowed again below.
          if (state?.status === 'active' && !lent.rows.length) break;
          await pool.query(
            `INSERT INTO byteplus_trust_loans (generation_id, workspace_id, local_asset_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (generation_id, local_asset_id) DO UPDATE SET released_at = NULL`,
            [generationId, workspaceId, assetId],
          );
          if (state?.status !== 'active' && state?.status !== 'processing') {
            state = await trusts().startTrust(workspaceId, assetId, TRUST_SCOPE);
          }
          if (!(await waitActive(workspaceId, assetId, state))) failed.push(assetId);
          break;
        } catch (error) {
          const retry = Boolean(error?.retryable) && attempt < retryDelaysMs.length;
          // The provider's own status and code, and the network cause, so a failure says why.
          log.error('[seedance-trust] could not trust reference', JSON.stringify({
            generationId, assetId, attempt: attempt + 1, willRetry: retry,
            code: error?.code, message: error?.message, action: error?.action, status: error?.status,
            providerCode: error?.providerCode, cause: error?.cause?.code || error?.cause?.name || error?.cause?.message,
          }));
          if (!retry) {
            failed.push(assetId);
            break;
          }
          await sleep(isQuotaError(error) ? quotaDelayMs : retryDelaysMs[attempt]);
        }
      }
    }
    return failed;
  }

  // Gives back this generation's loans. The trusts stay on BytePlus for the next generation
  // of the same images; sweep removes those unused for keepTrustMs.
  async function release(generationId) {
    const returned = await pool.query(
      'UPDATE byteplus_trust_loans SET released_at = now() WHERE generation_id = $1 AND released_at IS NULL RETURNING workspace_id, local_asset_id',
      [generationId],
    );
    return returned.rows.length;
  }

  // Gives back loans whose generation finished or whose worker died, then removes the trusts
  // nothing has borrowed for keepTrustMs.
  async function sweep() {
    const stale = await pool.query(
      `SELECT DISTINCT l.generation_id FROM byteplus_trust_loans l
       LEFT JOIN generation_jobs j ON j.id = l.generation_id
       WHERE l.released_at IS NULL
         AND (j.id IS NULL OR j.status NOT IN ('queued', 'running', 'processing') OR l.created_at < $1)`,
      [new Date(now() - STALE_LOAN_MS).toISOString()],
    );
    let released = 0;
    for (const row of stale.rows) released += await release(row.generation_id);

    const unused = await pool.query(
      `SELECT workspace_id, local_asset_id FROM byteplus_trust_loans
       GROUP BY workspace_id, local_asset_id
       HAVING bool_and(released_at IS NOT NULL) AND max(released_at) < $1
       ORDER BY max(released_at)
       LIMIT $2`,
      // A few per sweep: removing is a write too, and generations need the quota more.
      [new Date(now() - keepTrustMs).toISOString(), REMOVALS_PER_SWEEP],
    );
    for (const { workspace_id: workspaceId, local_asset_id: assetId } of unused.rows) {
      try {
        await trusts().deleteTrust(workspaceId, assetId, TRUST_SCOPE);
      } catch (error) {
        // Left for the next sweep; the quota error clears within a minute.
        log.error('[seedance-trust] could not remove trust', JSON.stringify({ assetId, code: error?.code, providerCode: error?.providerCode }));
        continue;
      }
      // Forget the loans only for a trust that is gone, and only if none was taken meanwhile.
      await pool.query(
        `DELETE FROM byteplus_trust_loans WHERE workspace_id = $1 AND local_asset_id = $2
           AND NOT EXISTS (SELECT 1 FROM byteplus_trust_loans h WHERE h.workspace_id = $1 AND h.local_asset_id = $2 AND h.released_at IS NULL)`,
        [workspaceId, assetId],
      );
    }
    return released;
  }

  return { flagged, markNeedsTrust, borrow, release, sweep };
}
