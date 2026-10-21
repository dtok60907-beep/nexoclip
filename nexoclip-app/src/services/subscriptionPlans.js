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

// Launch promo: a share off the first monthly payment of a workspace that has never
// subscribed. 20% keeps every plan above provider cost even if all credits are used
// (a credit costs about Rp112; Pro at 20% off sells it at Rp124). Credits stay full.
// SUBSCRIPTION_PROMO_PERCENT=0 turns it off; SUBSCRIPTION_PROMO_ENDS_AT moves the end.
const PROMO_PERCENT = 20;
const PROMO_ENDS_AT = '2026-11-30T17:00:00Z'; // end of 30 Nov 2026, WIB
const PROMO_MAX_PERCENT = 25;

export function firstPaymentPromo(env = process.env, at = new Date()) {
  const percent = env.SUBSCRIPTION_PROMO_PERCENT === undefined || env.SUBSCRIPTION_PROMO_PERCENT === '' ? PROMO_PERCENT : Number(env.SUBSCRIPTION_PROMO_PERCENT);
  const endsAt = env.SUBSCRIPTION_PROMO_ENDS_AT || PROMO_ENDS_AT;
  if (!(percent > 0) || percent > PROMO_MAX_PERCENT || !(new Date(endsAt) > at)) return null;
  return { percent, endsAt: new Date(endsAt).toISOString(), interval: 'monthly' };
}

export const promoPrice = (priceIdr, promo) => Math.round(priceIdr * (100 - promo.percent) / 100);
