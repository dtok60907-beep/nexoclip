import { NextResponse } from 'next/server';
import { getPool } from '../../../../../src/db/pool.js';
import { webhookSecretMatches } from '../../../../../src/lib/billing/pakasirClient.js';
import { createBillingWebhookService } from '../../../../../src/services/billingService.js';
import { topupService } from '../../../../../src/services/topupService.js';

// Pakasir posts here when a payment completes. The X-Secret check only keeps
// out noise; credits are granted after re-reading the transaction from
// Pakasir's API inside settleByTxnId.
export async function POST(request) {
  const rawBody = await request.text();
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }
  if (!payload?.txn_id) return NextResponse.json({ error: 'txn_id is required' }, { status: 400 });

  const service = createBillingWebhookService({
    pool: getPool(),
    verifier: async ({ signature }) => webhookSecretMatches(process.env.PAKASIR_WEBHOOK_SECRET, signature),
    handler: async ({ eventId }) => { await topupService().settleByTxnId(eventId); },
  });

  try {
    await service.receive({
      providerKey: 'pakasir',
      eventId: String(payload.txn_id),
      eventType: `transaction.${payload.status || 'unknown'}`,
      rawBody,
      signature: request.headers.get('x-secret'),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error.message === 'Invalid webhook signature' ? 401 : error.status || 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
