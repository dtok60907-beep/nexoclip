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

export function createSeedanceAutoTrust({
  pool,
  trustService = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  pollMs = POLL_MS,
  timeoutMs = TIMEOUT_MS,
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
      try {
        let state = await trusts().getTrust(workspaceId, assetId, TRUST_SCOPE);
        const lent = await pool.query(
          'SELECT 1 FROM byteplus_trust_loans WHERE workspace_id = $1 AND local_asset_id = $2 LIMIT 1',
          [workspaceId, assetId],
        );
        // Active with no loans: someone trusted it on purpose (Studio, Director). Use it, never remove it.
        if (state?.status === 'active' && !lent.rows.length) continue;
        await pool.query(
          `INSERT INTO byteplus_trust_loans (generation_id, workspace_id, local_asset_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [generationId, workspaceId, assetId],
        );
        if (state?.status !== 'active' && state?.status !== 'processing') {
          state = await trusts().startTrust(workspaceId, assetId, TRUST_SCOPE);
        }
        if (!(await waitActive(workspaceId, assetId, state))) failed.push(assetId);
      } catch (error) {
        log.error('[seedance-trust] could not trust reference', JSON.stringify({ generationId, assetId, code: error?.code, message: error?.message }));
        failed.push(assetId);
      }
    }
    return failed;
  }

  // Gives back this generation's loans; an image is untrusted once no other generation holds it.
  async function release(generationId) {
    const returned = await pool.query(
      'DELETE FROM byteplus_trust_loans WHERE generation_id = $1 RETURNING workspace_id, local_asset_id',
      [generationId],
    );
    for (const { workspace_id: workspaceId, local_asset_id: assetId } of returned.rows) {
      const held = await pool.query(
        'SELECT 1 FROM byteplus_trust_loans WHERE workspace_id = $1 AND local_asset_id = $2 LIMIT 1',
        [workspaceId, assetId],
      );
      if (held.rows.length) continue;
      try {
        await trusts().deleteTrust(workspaceId, assetId, TRUST_SCOPE);
      } catch (error) {
        // The asset stays trusted until someone removes it; the slot is not leaked forever
        // because a later generation of the same image borrows and releases it again.
        log.error('[seedance-trust] could not remove trust', JSON.stringify({ generationId, assetId, message: error?.message }));
      }
    }
    return returned.rows.length;
  }

  // Loans whose generation finished or whose worker died.
  async function sweep() {
    const stale = await pool.query(
      `SELECT DISTINCT l.generation_id FROM byteplus_trust_loans l
       LEFT JOIN generation_jobs j ON j.id = l.generation_id
       WHERE j.id IS NULL OR j.status NOT IN ('queued', 'running', 'processing')
          OR l.created_at < $1`,
      [new Date(now() - STALE_LOAN_MS).toISOString()],
    );
    let released = 0;
    for (const row of stale.rows) released += await release(row.generation_id);
    return released;
  }

  return { flagged, markNeedsTrust, borrow, release, sweep };
}
