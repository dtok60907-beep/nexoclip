// Callers hold the credit-account lock and share the account/ledger transaction.
// FIFO and invariants execute in PostgreSQL so NUMERIC precision is preserved.
export async function createCreditLot(client, {
  workspaceId, sourceLedgerId, credits, sourceType = 'unknown', amountIdr = null, paymentFeeIdr = null,
}) {
  const result = await client.query(
    `INSERT INTO credit_lots (workspace_id, source_ledger_id, source_type, granted_credits, available_credits, amount_idr, payment_fee_idr)
     SELECT workspace_id, id, $4, $3::numeric(20, 6), $3::numeric(20, 6), $5::numeric, $6::numeric
     FROM credit_ledger WHERE workspace_id = $1 AND id = $2 AND amount = $3::numeric(20, 6) AND amount > 0
     ON CONFLICT (workspace_id, source_ledger_id) DO NOTHING
     RETURNING id, workspace_id, source_ledger_id, source_type, granted_credits, available_credits, amount_idr, payment_fee_idr`,
    [workspaceId, sourceLedgerId, credits, sourceType, amountIdr, paymentFeeIdr],
  );
  return result.rows[0] || null;
}

export async function assertCreditLotBalance(client, workspaceId) {
  await client.query('SELECT assert_credit_lot_balance($1::uuid)', [workspaceId]);
}

export async function reserveGenerationCreditLots(client, { workspaceId, generationId, credits }) {
  await client.query('SELECT reserve_generation_credit_lots($1::uuid, $2::uuid, $3::numeric(20, 6))', [workspaceId, generationId, credits]);
}

export async function finalizeGenerationCreditLots(client, { workspaceId, generationId, reservedCredits, consumedCredits }) {
  await client.query('SELECT finalize_generation_credit_lots($1::uuid, $2::uuid, $3::numeric(20, 6), $4::numeric(20, 6))', [workspaceId, generationId, reservedCredits, consumedCredits]);
}

export async function debitCreditLots(client, { workspaceId, credits }) {
  await client.query('SELECT debit_credit_lots($1::uuid, $2::numeric(20, 6))', [workspaceId, credits]);
}

export async function getGenerationCreditRevenue(db, workspaceId, generationId) {
  const result = await db.query(
    `SELECT COALESCE(SUM(allocation.consumed_credits), 0) AS consumed_credits,
       CASE WHEN COUNT(*) = 0 OR BOOL_OR(lot.amount_idr IS NULL AND allocation.consumed_credits > 0)
         THEN NULL ELSE SUM(CASE WHEN allocation.consumed_credits > 0 THEN allocation.consumed_credits * lot.amount_idr / lot.granted_credits ELSE 0 END) END AS revenue_idr,
       CASE WHEN COUNT(*) = 0 OR BOOL_OR(lot.payment_fee_idr IS NULL AND allocation.consumed_credits > 0)
         THEN NULL ELSE SUM(CASE WHEN allocation.consumed_credits > 0 THEN allocation.consumed_credits * lot.payment_fee_idr / lot.granted_credits ELSE 0 END) END AS payment_fee_idr
     FROM generation_credit_allocations allocation JOIN credit_lots lot
       ON lot.workspace_id = allocation.workspace_id AND lot.id = allocation.lot_id
     WHERE allocation.workspace_id = $1 AND allocation.generation_job_id = $2 AND allocation.finalized_at IS NOT NULL`,
    [workspaceId, generationId],
  );
  return result.rows[0] || null;
}
