import * as repository from '../repositories/paymentFeeRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function inputError(message, status = 400) { return Object.assign(new Error(message), { status, code: 'INVALID_FEE_RECONCILIATION' }); }
export function feeAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw inputError('Fee must be a non-negative IDR amount');
  const text = String(value).trim();
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(text)) throw inputError('Fee must be a non-negative IDR amount with at most eight decimal places');
  const [whole, fraction = ''] = text.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(8, '0')}`;
}

export async function listPaymentFeeCandidates(pool, { workspaceId, page, pageSize }, repo = repository) {
  if (!UUID.test(workspaceId || '')) throw inputError('Workspace ID is required');
  function paginationNumber(value, fallback, maximum) {
    if (value === undefined || value === null || value === '') return fallback;
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) throw inputError('Pagination is invalid');
    return Number(value);
  }
  page = paginationNumber(page, 1, 1000000);
  pageSize = paginationNumber(pageSize, 20, 100);
  const data = await repo.listPaidTopupLots(pool, { workspaceId, page, pageSize });
  const total = Number(data.total);
  return {
    items: data.items.map(row => ({ id: row.id, packageCode: row.package_code, amountIdr: row.amount_idr,
      completedAt: row.completed_at, paymentFeeIdr: row.payment_fee_idr })),
    pagination: { page, pageSize, total, totalPages: total ? Math.ceil(total / pageSize) : 0 },
  };
}

export async function reconcilePaymentFee(pool, { workspaceId, userId, topupId, feeIdr, reconciliationKey, evidenceReference }, repo = repository) {
  if (!UUID.test(topupId || '') || !UUID.test(userId || '') || !UUID.test(workspaceId || '')) throw inputError('Workspace, operator and top-up IDs are required');
  if (typeof reconciliationKey !== 'string' || !/^[\w:.-]{1,120}$/.test(reconciliationKey)) throw inputError('Reconciliation key is invalid');
  if (typeof evidenceReference !== 'string' || !evidenceReference.trim() || evidenceReference.length > 250) throw inputError('Invoice or gateway evidence reference is required');
  const amount = feeAmount(feeIdr);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lot = await repo.lockPaidTopupLot(client, workspaceId, topupId);
    if (!lot) throw inputError('Completed paid top-up lot not found', 404);
    const { observation, inserted } = await repo.insertPaymentFeeObservation(client, {
      workspaceId, userId, topupId, lotId: lot.lot_id, feeIdr: amount, reconciliationKey, evidenceReference: evidenceReference.trim(),
    });
    if (!observation || observation.topup_id !== topupId || observation.lot_id !== lot.lot_id
        || feeAmount(observation.fee_idr) !== amount || observation.evidence_reference !== evidenceReference.trim()) {
      throw inputError('Reconciliation key was already used for different evidence', 409);
    }
    // Replaying an older observation must never undo a later correction.
    if (inserted) await repo.setLotPaymentFee(client, workspaceId, lot.lot_id, amount);
    await client.query('COMMIT');
    return { observationId: String(observation.id), topupId, feeIdr: inserted ? amount : lot.payment_fee_idr, replayed: !inserted };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
