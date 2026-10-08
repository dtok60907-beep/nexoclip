import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBytePlusBillingCsv, sumDecimals, subtractDecimals, sumUsageDecimals } from '../../src/lib/byteplusBillingCsv.js';

// Entirely synthetic billing data; never include a customer's export in a fixture.
const example = {
  'Billing cycle': '2026-10',
  'Owner account ID': '12345',
  Product: 'ModelArk',
  'Billing mode': 'Pay-as-you-go',
  'Billing type': 'Consumption-usage',
  'Consumption start time(UTC+8)': '2026-10-01 00:00:00',
  'Consumption end time(UTC+8)': '2026-10-01 00:05:00',
  'Transaction time(UTC+8)': '2026-10-02 10:00:00',
  'Instance ID': 'instance-test',
  'Configuration name': 'Seedream example',
  'Billing unit': 'output-image',
  Usage: '1',
  'Usage unit': 'Piece',
  'Package usage': '0',
  'Pricing Currency': 'USD',
  'Payment Currency': 'USD',
  'Gross amount': '0.045',
  'Savings plan deduction gross amount': '0',
  'Discount amount': '0',
  'Coupon used': '0',
  'Amount(truncated)': '0.005',
  'Pre-tax amount (payment currency)': '0.04',
  'Tax (payment currency)': '0',
  'Post-tax amount (payment currency)': '0.04',
};
const headers = Object.keys(example);
const quote = (value) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
function csv(rows = [{}], { columns = headers, newline = '\n', bom = '' } = {}) {
  return bom + [columns, ...rows.map((row) => columns.map((column) => ({ ...example, ...row })[column] ?? ''))]
    .map((row) => row.map(quote).join(',')).join(newline) + newline;
}
function rejects(text, pattern) {
  assert.throws(() => parseBytePlusBillingCsv(text), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, pattern);
    return true;
  });
}

test('reads USD usage, exact amounts, explicit UTC+8 intervals and only allowed fields', () => {
  const result = parseBytePlusBillingCsv(csv([{ 'Owner user name': 'Private name', 'Tag Remark': 'private detail' }], {
    columns: [...headers, 'Owner user name', 'Tag Remark'],
  }));
  assert.equal(result.providerAccountId, '12345');
  assert.equal(result.billingCycle, '2026-10');
  assert.equal(result.currency, 'USD');
  assert.equal(result.periodStart, '2026-09-30T16:00:00.000Z');
  assert.equal(result.periodEnd, '2026-09-30T16:05:00.000Z');
  assert.equal(result.rows[0].transactionAt, '2026-10-02T02:00:00.000Z');
  assert.equal(result.rows[0].grossUsd, '0.04500000');
  assert.equal(result.rows[0].usage, '1.000000000000');
  assert.equal(result.totals.totalUsd, '0.04000000');
  assert.deepEqual(result.warnings, []);
  assert.match(result.fileHash, /^[a-f0-9]{64}$/);
  assert.match(result.rows[0].identityHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('Private name'), false);
  assert.equal(JSON.stringify(result).includes('private detail'), false);
});

test('handles RFC4180 quoted commas, escaped quotes, newlines and physical line numbers', () => {
  const result = parseBytePlusBillingCsv(csv([
    { Product: 'Model, "Premium"\nService' },
    { 'Instance ID': 'next-instance' },
  ], { bom: '\uFEFF', newline: '\r\n' }));
  assert.equal(result.rows[0].product, 'Model, "Premium"\nService');
  assert.deepEqual(result.rows.map((row) => row.lineNumber), [2, 4]);
  assert.equal(result.totals.grossUsd, '0.09000000');
});

test('canonical fingerprints ignore ordering, BOM, line endings and equivalent number formatting', () => {
  const rows = [{ Product: 'First\nitem' }, { 'Instance ID': 'second-instance', Usage: '02.00' }];
  const first = parseBytePlusBillingCsv(csv(rows));
  const second = parseBytePlusBillingCsv(csv([
    { 'Instance ID': 'second-instance', Usage: '2.0000' },
    { Product: 'First\r\nitem', 'Gross amount': '00.04500000' },
  ], { columns: [...headers].reverse(), bom: '\uFEFF', newline: '\r\n' }));
  assert.equal(first.fileHash, second.fileHash);
  assert.equal(first.rows[0].identityHash, second.rows[1].identityHash);
  assert.notEqual(first.fileHash, parseBytePlusBillingCsv(csv([{ 'Pre-tax amount (payment currency)': '0.03', 'Post-tax amount (payment currency)': '0.03' }])).fileHash);
});

test('rejects duplicate semantic lines including those with different decimal formatting', () => {
  rejects(csv([{}, { 'Gross amount': '00.04500000' }]), /duplikat secara isi/);
});

test('transaction time distinguishes separate settlements with otherwise identical usage', () => {
  const result = parseBytePlusBillingCsv(csv([{}, { 'Transaction time(UTC+8)': '2026-10-02 11:00:00' }]));
  assert.equal(result.rows.length, 2);
  assert.notEqual(result.rows[0].identityHash, result.rows[1].identityHash);
});

test('preserves fractional package consumption and warns that zero bill is not zero COGS', () => {
  const result = parseBytePlusBillingCsv(csv([
    { Usage: '2.8', 'Package usage': '1.1234567891', 'Gross amount': '0', 'Amount(truncated)': '0', 'Pre-tax amount (payment currency)': '0', 'Post-tax amount (payment currency)': '0' },
    { 'Instance ID': 'tokens-instance', 'Usage unit': 'K tokens', Usage: '3', 'Package usage': '2.3' },
  ]));
  assert.equal(result.rows[0].packageUsage, '1.123456789100');
  assert.equal(result.totals.hasPackageUsage, true);
  assert.equal(result.totals.packageUsageRowCount, 2);
  assert.deepEqual(result.totals.packageUsageByUnit, { 'K tokens': '2.300000000000', Piece: '1.123456789100' });
  assert.match(result.warnings[0], /nol tidak berarti COGS nol/);
  rejects(csv([{ 'Package usage': '1.000000000001' }]), /melebihi Usage/);
});

test('preserves savings plan deductions and marks unallocated commitment costs', () => {
  const result = parseBytePlusBillingCsv(csv([{ 'Savings plan deduction gross amount': '0.02' }]));
  assert.equal(result.rows[0].savingsPlanGrossUsd, '0.02000000');
  assert.equal(result.totals.savingsPlanGrossUsd, '0.02000000');
  assert.match(result.warnings[0], /savings plan/);
});

test('uses precise arithmetic beyond Number safe integers and supports negative differences', () => {
  assert.equal(sumDecimals(['0.1', '0.2']), '0.30000000');
  assert.equal(sumDecimals(['9007199254740993.00000001', '0.00000002']), '9007199254740993.00000003');
  assert.equal(subtractDecimals('0.3', '0.30000001'), '-0.00000001');
  assert.equal(sumUsageDecimals(['1.123456789123', '0.000000000001']), '1.123456789124');
  assert.equal(parseBytePlusBillingCsv(csv([
    { 'Gross amount': '999999999999999999.99999999' },
    { 'Instance ID': 'second-instance', 'Gross amount': '0.00000001' },
  ])).totals.grossUsd, '1000000000000000000.00000000');
});

test('requires nonempty CSV data, strict headers and consistent field counts', () => {
  rejects('', /setidaknya satu baris/);
  rejects(headers.join(','), /setidaknya satu baris/);
  rejects(csv([{}], { columns: [...headers, 'Product'] }), /Header CSV duplikat/);
  rejects(csv([{}], { columns: [...headers, ' product '] }), /Header CSV duplikat/);
  rejects(csv([{}], { columns: [...headers, ''] }), /Header CSV kosong/);
  rejects(csv([{}], { columns: headers.filter((header) => header !== 'Gross amount') }), /Gross amount/);
  rejects(csv().trimEnd() + ',extra\n', /Jumlah kolom/);
  rejects(csv().trimEnd().replace(/,[^,]*$/, ''), /Jumlah kolom/);
});

test('rejects malformed CSV quotes instead of silently changing columns or values', () => {
  rejects(csv([{ Product: 'Model"bad' }]).replace('"Model""bad"', 'Model"bad'), /kutip CSV tidak valid/);
  rejects(csv([{ Product: 'Model' }]).replace(',Model,', ',"Model"extra,'), /kutip CSV tidak valid/);
  rejects(csv().trimEnd() + '"', /kutip CSV tidak valid/);
  rejects(csv().replace(',ModelArk,', ',"ModelArk,'), /belum ditutup/);
  rejects(csv([{ Product: 'nul\0text' }]), /NUL/);
});

test('requires a single provider owner and billing month', () => {
  rejects(csv([{}, { 'Owner account ID': '999' }]), /satu Owner account ID/);
  rejects(csv([{}, { 'Billing cycle': '2026-11' }]), /satu Billing cycle/);
  rejects(csv([{ 'Owner account ID': '' }]), /wajib terisi/);
  rejects(csv([{ 'Owner account ID': 'account-text' }]), /ID numerik/);
  rejects(csv([{ 'Billing cycle': '2026-13' }]), /YYYY-MM/);
});

test('rejects unsupported currencies, prepaid purchases, refunds and corrections', () => {
  rejects(csv([{ 'Pricing Currency': 'IDR' }]), /harus USD/);
  rejects(csv([{ 'Payment Currency': 'EUR' }]), /harus USD/);
  rejects(csv([{ 'Billing mode': 'Prepaid' }]), /hanya Pay-as-you-go/);
  rejects(csv([{ 'Billing type': 'Refund' }]), /hanya Pay-as-you-go/);
});

test('rejects malformed, negative, oversized or over-precision decimal amounts', () => {
  for (const value of ['', '-', '-0', '-1', 'NaN', 'Infinity', '1e2', '1,000', '.1', '1.', '+1', '0.123456789', '1000000000000000000']) {
    rejects(csv([{ 'Gross amount': value }]), /Gross amount.*(desimal|terlalu besar)/);
  }
  rejects(csv([{ Usage: '0.1234567891234' }]), /Usage.*desimal/);
  rejects(csv([{ 'Price': 'NaN' }], { columns: [...headers, 'Price'] }), /Price.*desimal/);
  rejects(csv([{ 'Tax rate': '-1' }], { columns: [...headers, 'Tax rate'] }), /Tax rate.*desimal/);
});

test('requires exact pre-tax plus tax reconciliation for each billing line', () => {
  rejects(csv([{ 'Tax (payment currency)': '0.001' }]), /Pre-tax amount ditambah Tax/);
  rejects(csv([{ 'Post-tax amount (payment currency)': '0.04000001' }]), /Pre-tax amount ditambah Tax/);
  const result = parseBytePlusBillingCsv(csv([{
    'Pre-tax amount (payment currency)': '0.1',
    'Tax (payment currency)': '0.2',
    'Post-tax amount (payment currency)': '0.3',
  }]));
  assert.equal(result.totals.preTaxUsd, '0.10000000');
  assert.equal(result.totals.taxUsd, '0.20000000');
  assert.equal(result.totals.totalUsd, '0.30000000');
});

test('validates real calendar dates, time bounds and increasing consumption intervals', () => {
  for (const value of ['2026-10-00 00:00:00', '2026-10-32 00:00:00', '2026-13-01 00:00:00', '2026-10-01 24:00:00', '2026-10-01 00:60:00', '2026-10-01 00:00:60', '2026-02-29 00:00:00', '2026-10-01T00:00:00Z']) {
    rejects(csv([{ 'Consumption start time(UTC+8)': value }]), /Waktu mulai.*(tidak valid|UTC\+8)/);
  }
  rejects(csv([{ 'Consumption end time(UTC+8)': '2026-10-01 00:00:00' }]), /lebih awal/);
  rejects(csv([{ 'Consumption start time(UTC+8)': '2026-10-01 00:10:00' }]), /lebih awal/);
  rejects(csv([{ 'Transaction time(UTC+8)': 'invalid' }]), /Waktu transaksi.*UTC\+8/);
});

test('matches local billing month and accepts only the exclusive next-month boundary', () => {
  const result = parseBytePlusBillingCsv(csv([{
    'Consumption start time(UTC+8)': '2026-10-31 23:55:00',
    'Consumption end time(UTC+8)': '2026-11-01 00:00:00',
    'Transaction time(UTC+8)': '2026-11-02 12:00:00',
  }]));
  assert.equal(result.periodEnd, '2026-10-31T16:00:00.000Z');
  rejects(csv([{ 'Consumption start time(UTC+8)': '2026-09-30 23:59:59' }]), /di luar Billing cycle/);
  rejects(csv([{ 'Consumption end time(UTC+8)': '2026-11-01 00:00:01' }]), /di luar Billing cycle/);
  const leap = parseBytePlusBillingCsv(csv([{
    'Billing cycle': '2028-02',
    'Consumption start time(UTC+8)': '2028-02-29 23:55:00',
    'Consumption end time(UTC+8)': '2028-03-01 00:00:00',
  }]));
  assert.equal(leap.periodEnd, '2028-02-29T16:00:00.000Z');
});

test('enforces byte limit against UTF-8 content, not JavaScript character count', () => {
  const oversized = csv([{ Product: '😀'.repeat(530000) }]);
  assert.ok(oversized.length < 2 * 1024 * 1024);
  rejects(oversized, /batas 2 MB/);
  rejects(null, /teks UTF-8/);
});

test('rejects more than 10000 data rows before attempting duplicate or amount validation', () => {
  const smallest = Object.fromEntries(headers.map((header) => [header, '']));
  const oversized = csv(Array.from({ length: 10001 }, () => smallest));
  assert.ok(Buffer.byteLength(oversized) < 2 * 1024 * 1024);
  rejects(oversized, /batas 10.000 baris/);
});
