const topupColumns = 'id, workspace_id, user_id, package_code, amount_idr, credits, provider_key, order_id, provider_txn_id, payment_url, status, is_sandbox, credit_ledger_id, failure_reason, completed_at, created_at, updated_at';

export async function insertTopup(db, { workspaceId, userId, packageCode, amountIdr, credits, orderId }) {
  const result = await db.query(
    `INSERT INTO credit_topups (workspace_id, user_id, package_code, amount_idr, credits, order_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${topupColumns}`,
    [workspaceId, userId, packageCode, amountIdr, credits, orderId],
  );
  return result.rows[0];
}

export async function attachProviderTransaction(db, id, { txnId, paymentUrl, isSandbox = false }) {
  const result = await db.query(
    `UPDATE credit_topups SET provider_txn_id = $2, payment_url = $3, is_sandbox = $4, updated_at = now()
     WHERE id = $1 RETURNING ${topupColumns}`,
    [id, txnId, paymentUrl, isSandbox],
  );
  return result.rows[0] || null;
}

export async function findWorkspaceTopup(db, workspaceId, id) {
  const result = await db.query(
    `SELECT ${topupColumns} FROM credit_topups WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return result.rows[0] || null;
}

export async function listWorkspaceTopups(db, workspaceId, limit) {
  const result = await db.query(
    `SELECT ${topupColumns} FROM credit_topups WHERE workspace_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit],
  );
  return result.rows;
}

export async function lockTopupByTxnId(client, providerKey, txnId) {
  const result = await client.query(
    `SELECT ${topupColumns} FROM credit_topups
     WHERE provider_key = $1 AND provider_txn_id = $2 FOR UPDATE`,
    [providerKey, txnId],
  );
  return result.rows[0] || null;
}

export async function markTopupCompleted(client, id, { creditLedgerId, isSandbox, completedAt }) {
  const result = await client.query(
    `UPDATE credit_topups SET status = 'completed', credit_ledger_id = $2, is_sandbox = $3,
       completed_at = COALESCE($4::timestamptz, now()), updated_at = now()
     WHERE id = $1 RETURNING ${topupColumns}`,
    [id, creditLedgerId, isSandbox, completedAt || null],
  );
  return result.rows[0] || null;
}

export async function markTopupClosed(db, id, status, failureReason = null) {
  const result = await db.query(
    `UPDATE credit_topups SET status = $2, failure_reason = $3, updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING ${topupColumns}`,
    [id, status, failureReason],
  );
  return result.rows[0] || null;
}
