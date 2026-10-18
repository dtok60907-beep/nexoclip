import test from 'node:test';
import assert from 'node:assert/strict';

const { contractCredits, contractPricing, costIdrPerCredit } = await import('../../src/services/enterpriseContractPricing.js');
const env = { CREDIT_MARKUP_PERCENT: '60' };

test('a credit costs about Rp112 of provider spend at the 1.6x markup', () => {
  assert.equal(Math.round(costIdrPerCredit(env) * 100) / 100, 111.97);
});

test('the deal value minus the profit kept buys credits at cost', () => {
  assert.equal(contractCredits(50_000_000, 30, env), 312_587);
  assert.equal(contractCredits(2_500_000, 30, env), 15_629);
});

test('contract pricing gives credits per second for Seedance and per image', () => {
  const pricing = contractPricing(env);
  const seedance20 = pricing.videos.find((v) => v.label === 'Seedance 2.0 · 720p');
  assert.ok(seedance20.creditsPerSecond > 20 && seedance20.creditsPerSecond < 30);
  assert.ok(pricing.images.every((i) => i.creditsPerImage > 0));
});
