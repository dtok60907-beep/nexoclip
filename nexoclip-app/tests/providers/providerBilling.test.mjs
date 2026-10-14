import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_BILLING_CODE, providerBillingFailure } from '../../src/lib/providerBilling.js';
import { createBytePlusAdapter } from '../../src/providers/direct/byteplusAdapter.js';
import { generateElevenLabsAudio } from '../../src/services/elevenlabsAudio.js';

test('our provider account problems are recognised, ordinary refusals are not', () => {
  const logs = [];
  const log = (line) => logs.push(line);
  assert.equal(providerBillingFailure('byteplus', 'The request failed because your account has an overdue balance.', { log }).code, PROVIDER_BILLING_CODE);
  assert.equal(providerBillingFailure('elevenlabs', 'paid_plan_required Music API is not available for free users.', { log }).retryable, false);
  assert.equal(providerBillingFailure('elevenlabs', 'quota_exceeded This request exceeds your quota', { log }).code, PROVIDER_BILLING_CODE);
  assert.equal(providerBillingFailure('byteplus', "The input image 'content[4]' may contain real person.", { log }), null);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /provider_billing_blocked/);
});

test('an overdue BytePlus account fails the job with a clear, non-retried message', async () => {
  const adapter = createBytePlusAdapter({ apiKey: 'k', baseUrl: 'https://ark.example/api/v3', fetch: async () => new Response(
    JSON.stringify({ error: { message: 'The request failed because your account has an overdue balance.' } }), { status: 403 }) });
  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(adapter.submit({ model: 'seedance', prompt: 'x', duration: 5 }), (error) => {
      assert.equal(error.code, PROVIDER_BILLING_CODE);
      assert.equal(error.retryable, false);
      assert.match(error.publicMessage, /not charged/);
      return true;
    });
  } finally { console.error = original; }
});

test('an ElevenLabs plan that does not allow music is reported as our account problem', async () => {
  const fetch = async () => new Response(JSON.stringify({ detail: { code: 'paid_plan_required', message: 'Music API is not available for free users.' } }), { status: 402 });
  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(generateElevenLabsAudio({ type: 'music', text: 'calm guitar', durationSeconds: 10, instrumental: true }, { apiKey: 'k', fetchImpl: fetch }), (error) => {
      assert.equal(error.code, PROVIDER_BILLING_CODE);
      assert.equal(error.status, 424);
      return true;
    });
  } finally { console.error = original; }
});
