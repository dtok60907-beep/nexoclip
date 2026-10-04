// Pakasir payment gateway, API v2 (https://pakasir.com/p/create-transaction).
// Requests authenticate with the project's X-Api-Key; webhooks carry the
// project's webhook secret in X-Secret.

import crypto from 'node:crypto';

const DEFAULT_BASE_URL = 'https://app.pakasir.com';
const REQUEST_TIMEOUT_MS = 15_000;

function gatewayError(message, status = 502) {
  return Object.assign(new Error(message), { status, code: 'PAYMENT_GATEWAY_ERROR' });
}

export function createPakasirClient({ env = process.env, fetchImpl = fetch } = {}) {
  // Read lazily so the module can be imported at build time without secrets.
  function config() {
    const slug = env.PAKASIR_SLUG;
    const apiKey = env.PAKASIR_API_KEY;
    if (!slug || !apiKey) throw gatewayError('Payments are not configured', 503);
    return { slug, apiKey, baseUrl: (env.PAKASIR_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '') };
  }

  async function request(method, path, body) {
    const { apiKey, baseUrl } = config();
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { 'X-Api-Key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw gatewayError(`Payment gateway is unreachable: ${error.message}`);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw gatewayError(`Payment gateway request failed (${response.status})`);
    return data;
  }

  const segment = (value) => encodeURIComponent(String(value));

  return {
    isConfigured() {
      return Boolean(env.PAKASIR_SLUG && env.PAKASIR_API_KEY);
    },
    // Find-or-create: repeating the same order_id and body returns the same transaction.
    async createTransaction({ orderId, amount, method = 'payment_link' }) {
      return request('POST', `/api/v2/create-transaction/${segment(config().slug)}/${segment(orderId)}`, { method, amount });
    },
    // Rate limited by Pakasir to one call per 4 seconds per transaction.
    async getTransactionStatus(txnId) {
      return request('GET', `/api/v2/transaction-status/${segment(config().slug)}/${segment(txnId)}`);
    },
    async cancelTransaction(txnId) {
      return request('POST', `/api/v2/cancel-transaction/${segment(config().slug)}/${segment(txnId)}`);
    },
  };
}

export function webhookSecretMatches(expected, received) {
  if (!expected || !received) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const pakasirClient = createPakasirClient();
