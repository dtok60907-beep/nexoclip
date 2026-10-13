import test from 'node:test';
import assert from 'node:assert/strict';
import { STORYBOARD_TEXT_PRICES, storyboardTextCostUsd } from './storyboardTextPricing.js';

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

test('every model the AI Director may use is billed at the same price it tracks', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../services/OpenMontage/director_service/llm.py', import.meta.url), 'utf8');
  const table = source.match(/PRICES_PER_MILLION = \{([\s\S]*?)\n\}/)[1];
  const director = [...table.matchAll(/"([^"]+)": \(([\d.]+), ([\d.]+)\)/g)].map(([, model, input, output]) => ({ model, input: Number(input), output: Number(output) }));
  assert.ok(director.length >= 5);
  for (const { model, input, output } of director) {
    assert.doesNotMatch(model, /-pro|-sol/);
    const price = STORYBOARD_TEXT_PRICES[model];
    assert.ok(price, `${model} has no billing price`);
    assert.ok(Math.abs(price.input * 1e6 - input) < 1e-9 && Math.abs(price.output * 1e6 - output) < 1e-9, `${model} price differs`);
  }
});
