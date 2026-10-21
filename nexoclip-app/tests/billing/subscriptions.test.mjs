import test from 'node:test';
import assert from 'node:assert/strict';

const { addMonths } = await import('../../src/services/subscriptionService.js');
const { SUBSCRIPTION_PLANS, findSubscriptionPlan, subscriptionsEnabled } = await import('../../src/services/subscriptionPlans.js');

test('months are calendar months, clamped to the end of a shorter month', () => {
  assert.equal(addMonths('2026-01-31T10:00:00Z', 1).toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(addMonths('2026-11-01T00:00:00Z', 12).toISOString(), '2027-11-01T00:00:00.000Z');
  assert.equal(addMonths('2027-12-15T00:00:00Z', 1).toISOString(), '2028-01-15T00:00:00.000Z');
});

test('yearly plans cost ten months and deliver the same credits each month', () => {
  const monthly = findSubscriptionPlan('sub_creator_monthly'), yearly = findSubscriptionPlan('sub_creator_yearly');
  assert.equal(yearly.priceIdr, monthly.priceIdr * 10);
  assert.equal(yearly.monthlyCredits, monthly.monthlyCredits);
  assert.equal(SUBSCRIPTION_PLANS.length, 6);
});

test('subscriptions stay off unless enabled', () => {
  assert.equal(subscriptionsEnabled({}), false);
  assert.equal(subscriptionsEnabled({ SUBSCRIPTIONS_ENABLED: '1' }), true);
});

const { quotePlan } = await import('../../src/services/subscriptionService.js');
const plan = (code) => findSubscriptionPlan(code);
const monthlyStarter = { status: 'active', plan_code: 'sub_starter_monthly', current_period_start: '2026-11-01T00:00:00Z', current_period_end: '2026-12-01T00:00:00Z', next_credit_grant_at: null };

test('no running plan: the full price, the first month now', () => {
  assert.deepEqual(quotePlan(plan('sub_creator_monthly'), null, new Date('2026-11-16T00:00:00Z')), { kind: 'new', amountIdr: 399000, creditsNow: 2400, startsAt: '2026-11-16T00:00:00.000Z' });
});

test('upgrading half way through a month pays half the difference and gets half the extra credits now', () => {
  const quote = quotePlan(plan('sub_creator_monthly'), monthlyStarter, new Date('2026-11-16T00:00:00Z'));
  assert.equal(quote.kind, 'upgrade');
  assert.equal(quote.amountIdr, 125000); // (399.000 - 149.000) x 15/30, rounded up to a thousand
  assert.equal(quote.creditsNow, 775); // (2.400 - 850) x 15/30
  assert.equal(quote.creditsExpireAt, '2026-12-01T00:00:00.000Z');
});

test('a yearly upgrade is prorated over the year; its credits over the current month', () => {
  const yearly = { status: 'active', plan_code: 'sub_starter_yearly', current_period_start: '2026-11-01T00:00:00Z', current_period_end: '2027-11-01T00:00:00Z', next_credit_grant_at: '2026-12-01T00:00:00Z' };
  const quote = quotePlan(plan('sub_pro_yearly'), yearly, new Date('2026-11-16T00:00:00Z'));
  assert.equal(quote.kind, 'upgrade');
  assert.equal(quote.amountIdr, Math.ceil((8990000 - 1490000) * (350 / 365) / 1000) * 1000);
  assert.equal(quote.creditsNow, 2475); // (5.800 - 850) x 15/30
});

test('monthly to yearly starts a new year now; smaller plans start when the period ends; same plan renews', () => {
  const at = new Date('2026-11-16T00:00:00Z');
  assert.equal(quotePlan(plan('sub_starter_yearly'), monthlyStarter, at).kind, 'switch');
  const creatorMonthly = { ...monthlyStarter, plan_code: 'sub_creator_monthly' };
  assert.deepEqual(quotePlan(plan('sub_starter_monthly'), creatorMonthly, at), { kind: 'downgrade', amountIdr: 149000, creditsNow: 0, startsAt: '2026-12-01T00:00:00.000Z' });
  assert.equal(quotePlan(plan('sub_starter_monthly'), monthlyStarter, at).kind, 'renew');
  assert.equal(quotePlan(plan('sub_starter_monthly'), { ...creatorMonthly, pending_plan_code: 'sub_starter_monthly' }, at).kind, 'scheduled');
  assert.equal(quotePlan(plan('sub_creator_monthly'), { ...monthlyStarter, current_period_end: '2026-11-10T00:00:00Z' }, at).kind, 'new');
});

const { firstPaymentPromo } = await import('../../src/services/subscriptionPlans.js');

test('launch promo: 20% off the first monthly payment until the end of 30 Nov (WIB)', () => {
  const at = new Date('2026-11-16T00:00:00Z'), promo = firstPaymentPromo({}, at);
  assert.deepEqual(promo, { percent: 20, endsAt: '2026-11-30T17:00:00.000Z', interval: 'monthly' });
  assert.deepEqual(quotePlan(plan('sub_pro_monthly'), null, at, promo), {
    kind: 'new', amountIdr: 719200, creditsNow: 5800, startsAt: '2026-11-16T00:00:00.000Z',
    listPriceIdr: 899000, promoPercent: 20, promoEndsAt: '2026-11-30T17:00:00.000Z',
  });
  assert.equal(quotePlan(plan('sub_pro_yearly'), null, at, promo).amountIdr, 8990000);
  assert.equal(quotePlan(plan('sub_creator_monthly'), monthlyStarter, at, promo).kind, 'upgrade');
  assert.equal(firstPaymentPromo({}, new Date('2026-11-30T17:00:00Z')), null);
  assert.equal(firstPaymentPromo({ SUBSCRIPTION_PROMO_PERCENT: '0' }, at), null);
  assert.equal(firstPaymentPromo({ SUBSCRIPTION_PROMO_PERCENT: '40' }, at), null);
});

test('every plan stays above provider cost at the promo price, all credits used', () => {
  // 1 credit = 1/160 USD of provider cost (60% markup), priced at Rp17,915 per USD.
  const costPerCredit = 17915 / 160;
  for (const p of SUBSCRIPTION_PLANS.filter((x) => x.interval === 'monthly')) {
    assert.ok(p.priceIdr * 0.8 / p.monthlyCredits > costPerCredit * 1.05, p.code);
  }
});
