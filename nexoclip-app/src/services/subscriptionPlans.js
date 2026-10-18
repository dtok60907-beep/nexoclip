// Monthly and yearly plans. DRAFT prices (BILLING_TODO.md, 18 Oct 2026): not final, and
// the whole feature stays off until SUBSCRIPTIONS_ENABLED=1. Yearly costs ten months and
// still delivers its credits month by month. Credits expire at the end of their month.
const TIERS = [
  { tier: 'starter', name: 'Starter', monthlyPriceIdr: 149_000, monthlyCredits: 850 },
  { tier: 'creator', name: 'Creator', monthlyPriceIdr: 399_000, monthlyCredits: 2_400, popular: true },
  { tier: 'pro', name: 'Pro', monthlyPriceIdr: 899_000, monthlyCredits: 5_800 },
];
const YEARLY_PRICE_MONTHS = 10;

export const SUBSCRIPTION_PLANS = Object.freeze(TIERS.flatMap((t) => [
  { code: `sub_${t.tier}_monthly`, tier: t.tier, name: t.name, interval: 'monthly', months: 1, priceIdr: t.monthlyPriceIdr, monthlyCredits: t.monthlyCredits, popular: Boolean(t.popular) },
  { code: `sub_${t.tier}_yearly`, tier: t.tier, name: t.name, interval: 'yearly', months: 12, priceIdr: t.monthlyPriceIdr * YEARLY_PRICE_MONTHS, monthlyCredits: t.monthlyCredits, popular: Boolean(t.popular) },
]));

export function findSubscriptionPlan(code) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.code === code) || null;
}

export function subscriptionsEnabled(env = process.env) {
  return env.SUBSCRIPTIONS_ENABLED === '1';
}
