import test from 'node:test';
import assert from 'node:assert/strict';
import { createPakasirClient, webhookSecretMatches } from '../../src/lib/billing/pakasirClient.js';

const env = { PAKASIR_SLUG: 'nexoclip', PAKASIR_API_KEY: 'key-123' };

function recordingFetch(response, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => response };
  };
  return { calls, fetchImpl };
}

test('creates a v2 payment link transaction with the API key header', async () => {
  const { calls, fetchImpl } = recordingFetch({ txn_id: 'tx1', payment_link: 'https://app.pakasir.com/pay-v2/tx1' });
  const client = createPakasirClient({ env, fetchImpl });
  const result = await client.createTransaction({ orderId: 'NXC1', amount: 50000 });
  assert.equal(result.txn_id, 'tx1');
  assert.equal(calls[0].url, 'https://app.pakasir.com/api/v2/create-transaction/nexoclip/NXC1');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Api-Key'], 'key-123');
  assert.deepEqual(JSON.parse(calls[0].init.body), { method: 'payment_link', amount: 50000 });
});

test('reads transaction status from the v2 status endpoint', async () => {
  const { calls, fetchImpl } = recordingFetch({ txn_id: 'tx1', status: 'completed' });
  const client = createPakasirClient({ env: { ...env, PAKASIR_BASE_URL: 'https://sandbox.example/' }, fetchImpl });
  await client.getTransactionStatus('tx1');
  assert.equal(calls[0].url, 'https://sandbox.example/api/v2/transaction-status/nexoclip/tx1');
  assert.equal(calls[0].init.method, 'GET');
});

test('reports gateway failures as 502 and missing configuration as 503', async () => {
  const failing = createPakasirClient({ env, fetchImpl: recordingFetch({ message: 'bad' }, 500).fetchImpl });
  await assert.rejects(() => failing.getTransactionStatus('tx1'), (error) => error.status === 502);
  const unconfigured = createPakasirClient({ env: {}, fetchImpl: recordingFetch({}).fetchImpl });
  assert.equal(unconfigured.isConfigured(), false);
  await assert.rejects(() => unconfigured.getTransactionStatus('tx1'), (error) => error.status === 503);
});

test('compares the webhook secret exactly', () => {
  assert.equal(webhookSecretMatches('secret', 'secret'), true);
  assert.equal(webhookSecretMatches('secret', 'secreT'), false);
  assert.equal(webhookSecretMatches('secret', 'secret-longer'), false);
  assert.equal(webhookSecretMatches('', ''), false);
  assert.equal(webhookSecretMatches('secret', null), false);
});
