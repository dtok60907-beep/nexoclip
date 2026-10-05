import { appendCreditEntry, appendCreditEntryInTransaction } from './creditService.js';

const CREDITS_PER_USD = 100;
const CREDIT_PRECISION = 10;

export function costUsdToCredits(costUsd) {
  const cost = Number(costUsd);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('Provider cost is invalid');
  if (cost === 0) return 0;
  return Math.ceil((cost * CREDITS_PER_USD * CREDIT_PRECISION) - Number.EPSILON) / CREDIT_PRECISION;
}

// Free trial credits for a new workspace (about USD 0.25 of provider cost).
export const ONBOARDING_CREDITS = 50;

const onboardingEntry = (workspaceId) => ({
  workspaceId,
  amount: ONBOARDING_CREDITS,
  reason: 'onboarding_grant',
  idempotencyKey: `onboarding:${workspaceId}`,
  metadata: { credits: ONBOARDING_CREDITS },
});

export function grantOnboardingCredits(pool, { workspaceId }) {
  return appendCreditEntry(pool, onboardingEntry(workspaceId));
}

export function grantOnboardingCreditsInTransaction(client, { workspaceId }) {
  return appendCreditEntryInTransaction(client, onboardingEntry(workspaceId));
}
