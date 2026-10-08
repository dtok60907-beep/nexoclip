export async function listPaidTopupLots(pool, { workspaceId, page, pageSize }) {
  const result = await pool.query(
    `WITH candidates AS (
       SELECT topup.id, topup.package_code, topup.amount_idr, topup.completed_at, lot.payment_fee_idr
       FROM credit_topups topup
       JOIN credit_lots lot ON lot.workspace_id = topup.workspace_id AND lot.source_ledger_id = topup.credit_ledger_id
       WHERE topup.workspace_id = $1 AND topup.status = 'completed'
         AND topup.is_sandbox = false AND lot.source_type = 'paid'
     ), history AS (
       SELECT * FROM candidates ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT $2 OFFSET $3
     )
     SELECT COALESCE((SELECT json_agg(history ORDER BY completed_at DESC NULLS LAST, id DESC) FROM history), '[]'::json) AS items,
            (SELECT COUNT(*) FROM candidates) AS total`,
    [workspaceId, pageSize, (page - 1) * pageSize],
  );
  return result.rows[0] || { items: [], total: 0 };
}

export async function lockPaidTopupLot(client, workspaceId, topupId) {
  const result = await client.query(
    `SELECT topup.id AS topup_id, lot.id AS lot_id, lot.payment_fee_idr
     FROM credit_topups topup
     JOIN credit_lots lot ON lot.workspace_id = topup.workspace_id AND lot.source_ledger_id = topup.credit_ledger_id
     WHERE topup.workspace_id = $1 AND topup.id = $2 AND topup.status = 'completed'
       AND topup.is_sandbox = false AND lot.source_type = 'paid'
     FOR UPDATE OF topup, lot`, [workspaceId, topupId],
  );
  return result.rows[0] || null;
}

export async function insertPaymentFeeObservation(client, input) {
  const values = [input.workspaceId, input.topupId, input.lotId, input.feeIdr, input.reconciliationKey, input.evidenceReference, input.userId];
  const inserted = await client.query(
    `INSERT INTO payment_fee_observations
       (workspace_id, topup_id, lot_id, fee_idr, reconciliation_key, evidence_reference, recorded_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workspace_id, reconciliation_key) DO NOTHING
     RETURNING id, topup_id, lot_id, fee_idr, evidence_reference`, values,
  );
  if (inserted.rows[0]) return { observation: inserted.rows[0], inserted: true };
  const existing = await client.query(
    `SELECT id, topup_id, lot_id, fee_idr, evidence_reference
     FROM payment_fee_observations WHERE workspace_id = $1 AND reconciliation_key = $2`,
    [input.workspaceId, input.reconciliationKey],
  );
  return { observation: existing.rows[0], inserted: false };
}

export async function setLotPaymentFee(client, workspaceId, lotId, feeIdr) {
  await client.query(
    `UPDATE credit_lots SET payment_fee_idr = $3 WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, lotId, feeIdr],
  );
}
