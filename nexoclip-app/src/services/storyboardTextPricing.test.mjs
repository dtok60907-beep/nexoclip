import test from 'node:test';
import assert from 'node:assert/strict';
import { storyboardTextCostUsd } from './storyboardTextPricing.js';

test('prices gpt-4o-mini (OpenDirector default) and gpt-4o per documented OpenAI rates', () => {
  const mini = storyboardTextCostUsd({ model: 'gpt-4o-mini', inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(mini, 0.15 + 0.6);
  const full = storyboardTextCostUsd({ model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(full, 2.5 + 10);
});

test('refuses an unpriced model rather than guessing', () => {
  assert.throws(() => storyboardTextCostUsd({ model: 'not-a-real-model', inputTokens: 1, outputTokens: 1 }), (error) => {
    assert.equal(error.status, 422);
    return true;
  });
});
