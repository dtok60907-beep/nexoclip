import {
  createCreditAccount,
  findCreditEntryByIdempotencyKey,
  insertCreditEntry,
  lockCreditAccount,
  updateCreditBalance,
} from '../repositories/creditRepository.js';
import { debitCreditLotsInTransaction, grantCreditLotInTransaction } from './creditLotService.js';

export async function appendCreditEntryInTransaction(client, { workspaceId, amount, reason, idempotencyKey, metadata = {}, creditLot = null }) {
  if (!workspaceId || !idempotencyKey || !reason || !Number.isFinite(amount) || amount === 0) {
    throw new Error('Credit entry is invalid');
  }

  await createCreditAccount(client, workspaceId);
  const existing = await findCreditEntryByIdempotencyKey(client, workspaceId, idempotencyKey);
  if (existing) return existing;

  const account = await lockCreditAccount(client, workspaceId);
  const balance = Number(account.balance);
  const nextBalance = balance + amount;
  if (nextBalance < 0) throw new Error('Insufficient credits');

  await updateCreditBalance(client, workspaceId, nextBalance);
  const entry = await insertCreditEntry(client, {
    workspaceId, amount, balanceAfter: nextBalance, reason, idempotencyKey, metadata,
  });
  if (amount > 0) await grantCreditLotInTransaction(client, { workspaceId, entry, credits: amount, reason, creditLot });
  else await debitCreditLotsInTransaction(client, { workspaceId, credits: -amount });
  return entry;
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
