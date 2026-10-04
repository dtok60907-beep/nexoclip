import test from 'node:test';
import assert from 'node:assert/strict';
import { costUsdToCredits, grantOnboardingCredits } from '../../src/services/creditPricingService.js';

test('converts provider USD to credits rounded up to one decimal', () => {
  assert.equal(costUsdToCredits(0), 0);
  assert.equal(costUsdToCredits(0.00018), 0.1);
  assert.equal(costUsdToCredits(0.024), 2.4);
  assert.equal(costUsdToCredits(1), 100);
});

test('grants a workspace 50 onboarding credits with an idempotent key', async () => {
  const calls = [];
  const client = { async query(text, values) {
    calls.push({text, values});
    if (/INSERT INTO credit_accounts/.test(text)) return {rows: [{workspace_id: 'w1', balance: '0'}]};
    if (/FROM credit_ledger/.test(text)) return {rows: []};
    if (/FOR UPDATE/.test(text)) return {rows: [{workspace_id: 'w1', balance: '0'}]};
    if (/UPDATE credit_accounts/.test(text)) return {rows: [{workspace_id: 'w1', balance: '50'}]};
    if (/INSERT INTO credit_ledger/.test(text)) return {rows: [{id: 'onboarding-1', amount: '50'}]};
    return {rows: []};
  }, release() {}};
  const entry = await grantOnboardingCredits({connect: async () => client}, {workspaceId: 'w1'});
  assert.equal(entry.id, 'onboarding-1');
  const ledger = calls.find(({text}) => /INSERT INTO credit_ledger/.test(text));
  assert.deepEqual(ledger.values.slice(0, 5), ['w1', 50, 50, 'onboarding_grant', 'onboarding:w1']);
});

test('rejects invalid provider costs', () => {
  assert.throws(() => costUsdToCredits(-0.01), /Provider cost is invalid/);
  assert.throws(() => costUsdToCredits('invalid'), /Provider cost is invalid/);
});
