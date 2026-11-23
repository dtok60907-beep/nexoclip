import { NextResponse } from 'next/server';
import { getPool } from '../../../../../src/db/pool.js';
import { createBillingWebhookService } from '../../../../../src/services/billingService.js';
import { subscriptionService } from '../../../../../src/services/subscriptionService.js';
import { topupService } from '../../../../../src/services/topupService.js';

// Callback data is only a prompt; settlement re-reads the invoice using our API key.
export async function POST(request) {
  const rawBody = await request.text();
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }
  const invoiceId = payload?.invoice_id;
  if (typeof invoiceId !== 'string' || !invoiceId) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });

  const service = createBillingWebhookService({
    pool: getPool(),
    verifier: async () => true,
    handler: async ({ eventId }) => { if (!(await subscriptionService().settleByTxnId(eventId))) await topupService().settleByTxnId(eventId); },
  });
  try {
    await service.receive({ providerKey: 'meldapay', eventId: invoiceId, eventType: `invoice.${payload.status || 'unknown'}`, rawBody, signature: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
