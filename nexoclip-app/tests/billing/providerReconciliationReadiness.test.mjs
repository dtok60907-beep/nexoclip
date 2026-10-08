import test from 'node:test';
import assert from 'node:assert/strict';
import { requestReconciliationReadiness as readiness } from '../../src/lib/providerReconciliationReadiness.js';

function fixture() {
  return {
    bill: { provider_account_id: '123', environment: 'development', period_start: '2026-01-01T00:00:00Z', period_end: '2026-01-02T00:00:00Z' },
    request: { provider_request_id: 'request-1', provider_account_id: '123', environment: 'development', model: 'model-1', request_time: '2026-01-01T02:00:00Z', time_is_fallback: false, matching_jobs: '1', reconciliation_status: 'unreconciled', other_reconciliation_import_id: null, cost_usd: null },
    groups: [{ groupKey: 'payg', mapping: { model: 'model-1' }, package_usage: '0.000000000000', savings_plan_gross_usd: '0.00000000' }],
    payments: [{ kind: 'invoice_payment' }],
  };
}

const codes = value => readiness(value).reasons.map(reason => reason.code);

test('makes prerequisites available without claiming request charge or proof approval', () => {
  const f = fixture();
  assert.deepEqual(readiness(f), { canReconcile: true, reasons: [], eligibleGroupKeys: ['payg'] });
  f.bill.environment = f.request.environment = 'production';
  f.request.matching_jobs = 1;
  assert.equal(readiness(f).canReconcile, true);
  assert.equal(f.request.cost_usd, null);
});

test('requires exact account identity and distinguishes missing accounts from other accounts', () => {
  for (const account of [null, undefined, '', '   ']) {
    const f = fixture();
    f.request.provider_account_id = account;
    f.request.account_match = 'unknown';
    assert.deepEqual(codes(f), ['missing_account']);
  }
  const missingBillAccount = fixture();
  missingBillAccount.bill.provider_account_id = null;
  assert.deepEqual(codes(missingBillAccount), ['missing_account']);
  const other = fixture();
  other.request.provider_account_id = '456';
  assert.deepEqual(codes(other), ['account_mismatch']);
  const nonExact = fixture();
  nonExact.request.provider_account_id = '123 ';
  assert.deepEqual(codes(nonExact), ['account_mismatch']);
});

test('requires classified environments and avoids a redundant mismatch for an unclassified bill', () => {
  for (const environment of [null, undefined, 'unknown', 'unclassified']) {
    const f = fixture();
    f.request.environment = environment;
    assert.deepEqual(codes(f), ['missing_job_environment']);
    const unclassified = fixture();
    unclassified.bill.environment = environment;
    unclassified.request.environment = 'production';
    assert.deepEqual(codes(unclassified), ['unclassified_bill']);
  }
  const mismatch = fixture();
  mismatch.request.environment = 'production';
  assert.deepEqual(codes(mismatch), ['environment_mismatch']);
  const bothUnknown = fixture();
  bothUnknown.bill.environment = bothUnknown.request.environment = null;
  assert.deepEqual(codes(bothUnknown), ['unclassified_bill', 'missing_job_environment']);
});

test('requires a provider request ID, including nonempty text', () => {
  for (const id of [null, undefined, '', '   ']) {
    const f = fixture();
    f.request.provider_request_id = id;
    assert.deepEqual(codes(f), ['missing_request_id']);
  }
});

test('requires known dispatch time and rejects invalid timestamps', () => {
  for (const fallback of [true, null, undefined]) {
    const f = fixture();
    f.request.time_is_fallback = fallback;
    assert.deepEqual(codes(f), ['missing_dispatch']);
  }
  for (const time of [null, undefined, '', 'not-a-date', new Date('invalid')]) {
    const f = fixture();
    f.request.request_time = time;
    assert.deepEqual(codes(f), ['invalid_dispatch_time']);
  }
  const f = fixture();
  f.request.request_time = new Date(f.request.request_time);
  f.bill.period_start = new Date(f.bill.period_start);
  f.bill.period_end = new Date(f.bill.period_end);
  assert.equal(readiness(f).canReconcile, true);
});

test('uses a half-open invoice period and requires valid invoice bounds', () => {
  const atStart = fixture();
  atStart.request.request_time = atStart.bill.period_start;
  assert.equal(readiness(atStart).canReconcile, true);
  const lastMillisecond = fixture();
  lastMillisecond.request.request_time = '2026-01-01T23:59:59.999Z';
  assert.equal(readiness(lastMillisecond).canReconcile, true);
  for (const time of ['2025-12-31T23:59:59.999Z', '2026-01-02T00:00:00Z']) {
    const f = fixture();
    f.request.request_time = time;
    assert.deepEqual(codes(f), ['outside_period']);
  }
  for (const patch of [{ period_start: null }, { period_end: 'invalid' }, { period_start: '2026-01-02T00:00:00Z' }, { period_end: '2025-12-31T00:00:00Z' }]) {
    const f = fixture();
    Object.assign(f.bill, patch);
    assert.deepEqual(codes(f), ['invalid_period']);
  }
});

test('requires verified unique job identity, including string repository counts', () => {
  for (const count of [null, undefined, '', 'NaN', '1.0', '0', 0, -1, 1.5, true]) {
    const f = fixture();
    f.request.matching_jobs = count;
    assert.deepEqual(codes(f), ['identity_unverified']);
  }
  for (const count of ['2', 2, '999999999999999999999999']) {
    const f = fixture();
    f.request.matching_jobs = count;
    assert.deepEqual(codes(f), ['ambiguous_request']);
  }
});

test('directs already reconciled and corrected requests to correction even at zero cost', () => {
  for (const status of ['reconciled', 'corrected']) {
    const f = fixture();
    f.request.reconciliation_status = status;
    f.request.cost_usd = '0.00000000';
    assert.deepEqual(codes(f), ['use_correction']);
    assert.equal(readiness(f).canReconcile, false);
  }
  const crossInvoice = fixture();
  crossInvoice.request.other_reconciliation_import_id = 'other-invoice';
  assert.deepEqual(codes(crossInvoice), ['already_reconciled_other_invoice']);
});

test('distinguishes missing model mapping from a mapped model supported only by packages', () => {
  const unmapped = fixture();
  unmapped.groups[0].mapping = null;
  assert.deepEqual(codes(unmapped), ['missing_mapping']);
  unmapped.groups[0].mapping = { model: 'other-model' };
  assert.deepEqual(codes(unmapped), ['missing_mapping']);
  const missingModel = fixture();
  missingModel.request.model = null;
  missingModel.groups[0].mapping = { model: null };
  assert.deepEqual(codes(missingModel), ['missing_mapping']);
  for (const patch of [{ package_usage: '0.000000000001' }, { savings_plan_gross_usd: '0.00000001' }]) {
    const f = fixture();
    Object.assign(f.groups[0], patch);
    assert.deepEqual(codes(f), ['package_unsupported']);
    assert.deepEqual(readiness(f).eligibleGroupKeys, []);
  }
});

test('offers only mapped non-package group keys when a model has mixed SKU groups', () => {
  const f = fixture();
  f.groups.push(
    { groupKey: 'package', mapping: { model: 'model-1' }, package_usage: '1', savings_plan_gross_usd: '0' },
    { groupKey: 'savings', mapping: { model: 'model-1' }, package_usage: '0', savings_plan_gross_usd: '1' },
    { groupKey: 'other', mapping: { model: 'other-model' }, package_usage: '0', savings_plan_gross_usd: '0' },
    { groupKey: 'payg-2', mapping: { model: 'model-1' }, package_usage: '0', savings_plan_gross_usd: '0' },
  );
  assert.deepEqual(readiness(f), { canReconcile: true, reasons: [], eligibleGroupKeys: ['payg', 'payg-2'] });
});

test('requires invoice payment evidence rather than package purchases or allocations', () => {
  for (const payments of [[], null, [{ kind: 'package_purchase' }], [{ kind: 'package_allocation' }]]) {
    const f = fixture();
    f.payments = payments;
    assert.deepEqual(codes(f), ['missing_payment']);
  }
  const mixed = fixture();
  mixed.payments.unshift({ kind: 'package_purchase' });
  assert.equal(readiness(mixed).canReconcile, true);
});

test('returns multiple blockers in stable order while retaining available SKU choices', () => {
  const f = fixture();
  f.bill.environment = 'unclassified';
  f.request.provider_request_id = null;
  f.request.provider_account_id = null;
  f.request.environment = null;
  f.request.time_is_fallback = true;
  f.request.matching_jobs = '2';
  f.request.other_reconciliation_import_id = 'other-invoice';
  f.payments = [];
  const result = readiness(f);
  assert.equal(result.canReconcile, false);
  assert.deepEqual(result.reasons.map(reason => reason.code), ['unclassified_bill', 'missing_request_id', 'missing_account', 'missing_job_environment', 'missing_dispatch', 'ambiguous_request', 'already_reconciled_other_invoice', 'missing_payment']);
  assert.deepEqual(result.eligibleGroupKeys, ['payg']);
  assert.ok(result.reasons.every(reason => typeof reason.message === 'string' && reason.message.length > 0));
});
