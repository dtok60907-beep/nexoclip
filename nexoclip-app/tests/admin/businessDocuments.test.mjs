import test from 'node:test';
import assert from 'node:assert/strict';

const { terbilang } = await import('../../src/lib/terbilang.js');
const { documentNumber, createBusinessDocumentsService } = await import('../../src/services/businessDocumentsService.js');

test('receipts spell the amount in Indonesian', () => {
  assert.equal(terbilang(50_000_000), 'Lima puluh juta rupiah');
  assert.equal(terbilang(2_500_000), 'Dua juta lima ratus ribu rupiah');
  assert.equal(terbilang(1_001_115), 'Satu juta seribu seratus lima belas rupiah');
  assert.equal(terbilang(399_000), 'Tiga ratus sembilan puluh sembilan ribu rupiah');
});

test('business documents are numbered by year, month and sequence', () => {
  assert.equal(documentNumber({ created_at: '2026-10-18T03:00:00Z', document_seq: 7 }), 'NXB/2026/10/0007');
});

test('documents are for operators, and receipts only for paid invoices', async () => {
  const order = { id: 'o', status: 'pending', created_at: '2026-10-18T03:00:00Z', document_seq: 1, credits: '10', bonus_credits: '0' };
  const pool = { async query(sql) { return { rows: /FROM business_credit_orders/.test(sql) ? [order] : [{}] }; } };
  const operator = '11111111-1111-4111-8111-111111111111';
  const service = createBusinessDocumentsService({ pool, env: { NEXOCLIP_OPERATOR_USER_IDS: operator } });
  const id = '22222222-2222-4222-8222-222222222222';
  await assert.rejects(service.documentData('someone-else', id, 'quotation'), (e) => e.status === 403);
  assert.equal((await service.documentData(operator, id, 'quotation')).number, 'NXB/2026/10/0001');
  await assert.rejects(service.documentData(operator, id, 'receipt'), (e) => e.status === 409);
  await assert.rejects(service.documentData(operator, id, 'nonsense'), (e) => e.status === 404);
});
