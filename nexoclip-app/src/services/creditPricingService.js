const CREDITS_PER_USD = 100;
const CREDIT_PRECISION = 10;

export function costUsdToCredits(costUsd) {
  const cost = Number(costUsd);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('Provider cost is invalid');
  if (cost === 0) return 0;
  return Math.ceil((cost * CREDITS_PER_USD * CREDIT_PRECISION) - Number.EPSILON) / CREDIT_PRECISION;
}
