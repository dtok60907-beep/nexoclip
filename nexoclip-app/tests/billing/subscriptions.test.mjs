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
