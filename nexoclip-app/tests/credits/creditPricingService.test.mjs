import test from 'node:test';
import assert from 'node:assert/strict';
import { costUsdToCredits } from '../../src/services/creditPricingService.js';

test('converts provider USD to credits rounded up to one decimal', () => {
  assert.equal(costUsdToCredits(0), 0);
  assert.equal(costUsdToCredits(0.00018), 0.1);
  assert.equal(costUsdToCredits(0.024), 2.4);
  assert.equal(costUsdToCredits(1), 100);
});

test('rejects invalid provider costs', () => {
  assert.throws(() => costUsdToCredits(-0.01), /Provider cost is invalid/);
  assert.throws(() => costUsdToCredits('invalid'), /Provider cost is invalid/);
});
