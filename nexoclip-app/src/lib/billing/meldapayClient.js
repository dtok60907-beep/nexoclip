// MeldaPay invoice API: https://meldapay.com/docs
const DEFAULT_BASE_URL = 'https://meldapay.com';
const REQUEST_TIMEOUT_MS = 15_000;

function gatewayError(message, status = 502) {
  return Object.assign(new Error(message), { status, code: 'PAYMENT_GATEWAY_ERROR' });
}

export function createMeldapayClient({ env = process.env, fetchImpl = fetch } = {}) {
  function config() {
    if (!env.MELDAPAY_API_KEY) throw gatewayError('Payments are not configured', 503);
    return { apiKey: env.MELDAPAY_API_KEY, baseUrl: (env.MELDAPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '') };
  }

  async function request(path, params) {
    const { apiKey, baseUrl } = config();
    const query = new URLSearchParams({ apikey: apiKey, ...params });
    let response;
    try { response = await fetchImpl(`${baseUrl}${path}?${query}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }); }
    catch (error) { throw gatewayError(`Payment gateway is unreachable: ${error.message}`); }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success === false) throw gatewayError(`Payment gateway request failed (${response.status})`);
    return data;
  }

  return {
    isConfigured: () => Boolean(env.MELDAPAY_API_KEY),
    async createTransaction({ amount, callbackUrl }) {
      const invoice = await request('/api/invoice', { amount: String(amount), ...(callbackUrl ? { callback_url: callbackUrl } : {}) });
      return { txn_id: invoice.invoice_id, payment_link: invoice.payment_link };
    },
    async getTransactionStatus(invoiceId) {
      const invoice = await request('/api/invoice/status', { invoice_id: invoiceId });
      return {
        txn_id: invoice.invoice_id,
        order_id: invoice.order_id,
        amount: invoice.amount,
        status: invoice.status === 'paid' ? 'completed' : ['expired', 'cancelled'].includes(invoice.status) ? 'canceled' : 'pending',
        completed_at: invoice.completed_at || invoice.paid_at || null,
      };
    },
  };
}

export const meldapayClient = createMeldapayClient();
