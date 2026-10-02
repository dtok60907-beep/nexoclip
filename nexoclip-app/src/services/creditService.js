import {
  createCreditAccount,
  findCreditEntryByIdempotencyKey,
  insertCreditEntry,
  lockCreditAccount,
  updateCreditBalance,
} from '../repositories/creditRepository.js';

// 402 so routes surface a top-up prompt instead of a generic 400.
export function insufficientCreditsError() {
  return Object.assign(new Error('Insufficient credits'), { code: 'INSUFFICIENT_CREDITS', status: 402 });
}

export async function appendCreditEntryInTransaction(client, { workspaceId, amount, reason, idempotencyKey, metadata = {} }) {
  if (!workspaceId || !idempotencyKey || !reason || !Number.isFinite(amount) || amount === 0) {
    throw new Error('Credit entry is invalid');
  }

  await createCreditAccount(client, workspaceId);
  const existing = await findCreditEntryByIdempotencyKey(client, workspaceId, idempotencyKey);
  if (existing) return existing;

  const account = await lockCreditAccount(client, workspaceId);
  const balance = Number(account.balance);
  const nextBalance = balance + amount;
  if (nextBalance < 0) throw insufficientCreditsError();

  await updateCreditBalance(client, workspaceId, nextBalance);
  return insertCreditEntry(client, {
    workspaceId, amount, balanceAfter: nextBalance, reason, idempotencyKey, metadata,
  });
}

export async function appendCreditEntry(pool, entry) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await appendCreditEntryInTransaction(client, entry);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
