import {
  assertCreditLotBalance, createCreditLot, debitCreditLots,
  finalizeGenerationCreditLots, reserveGenerationCreditLots,
} from '../repositories/creditLotRepository.js';

const PROMO_REASONS = new Set(['grant', 'promo', 'promotion', 'bonus', 'signup_bonus', 'welcome_bonus', 'trial', 'trial_credit']);

function validMoney(value) {
  return (typeof value === 'number' || typeof value === 'string')
    && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

// Paid acquisition terms come explicitly from a verified payment, never from
// a package/list price or user-supplied ledger metadata. Bonus credits use
// the same total grant denominator as purchased credits.
export async function grantCreditLotInTransaction(client, { workspaceId, entry, credits, reason, creditLot = null }) {
  const sourceType = creditLot?.sourceType ?? (PROMO_REASONS.has(reason) ? 'promo' : 'unknown');
  if (!['paid', 'promo', 'sandbox', 'unknown'].includes(sourceType)) throw new TypeError('Credit lot source is invalid');
  let amountIdr = null;
  let paymentFeeIdr = null;
  if (sourceType === 'paid') {
    amountIdr = creditLot?.amountIdr;
    paymentFeeIdr = creditLot?.paymentFeeIdr ?? null;
    if (!validMoney(amountIdr) || Number(amountIdr) <= 0 || (paymentFeeIdr !== null && !validMoney(paymentFeeIdr))) {
      throw new TypeError('Paid credit acquisition value is invalid');
    }
  } else if (sourceType === 'promo' || sourceType === 'sandbox') {
    amountIdr = 0;
    paymentFeeIdr = 0;
  }
  await createCreditLot(client, { workspaceId, sourceLedgerId: entry.id, credits, sourceType, amountIdr, paymentFeeIdr });
  await assertCreditLotBalance(client, workspaceId);
}

export async function debitCreditLotsInTransaction(client, { workspaceId, credits }) {
  await debitCreditLots(client, { workspaceId, credits });
}

export async function reserveCreditLotsInTransaction(client, { workspaceId, generationId, credits }) {
  await reserveGenerationCreditLots(client, { workspaceId, generationId, credits });
}

export async function finalizeCreditLotsInTransaction(client, { workspaceId, generationId, reservedCredits, consumedCredits }) {
  await finalizeGenerationCreditLots(client, { workspaceId, generationId, reservedCredits, consumedCredits });
}
