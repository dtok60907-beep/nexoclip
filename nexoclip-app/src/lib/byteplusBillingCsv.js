import { createHash } from 'node:crypto';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10000;
const UTC8_OFFSET = 8 * 60 * 60 * 1000;
const MONEY_FIELDS = {
  grossUsd: 'Gross amount',
  savingsPlanGrossUsd: 'Savings plan deduction gross amount',
  discountUsd: 'Discount amount',
  couponUsd: 'Coupon used',
  truncatedUsd: 'Amount(truncated)',
  preTaxUsd: 'Pre-tax amount (payment currency)',
  taxUsd: 'Tax (payment currency)',
  totalUsd: 'Post-tax amount (payment currency)',
};
const REQUIRED_HEADERS = [
  'Billing cycle', 'Owner account ID', 'Product', 'Billing mode', 'Billing type',
  'Consumption start time(UTC+8)', 'Consumption end time(UTC+8)',
  'Transaction time(UTC+8)', 'Instance ID', 'Configuration name', 'Billing unit',
  'Usage', 'Usage unit', 'Package usage', 'Pricing Currency', 'Payment Currency',
  ...Object.values(MONEY_FIELDS),
];

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function toScaled(value, precision, { label = 'Angka', signed = false, maxIntegerDigits = 18 } = {}) {
  if (typeof value !== 'string') throw invalid(`${label} harus berupa teks desimal.`);
  const text = value.trim();
  const pattern = new RegExp(`^${signed ? '-?' : ''}\\d+(?:\\.\\d{1,${precision}})?$`);
  if (!pattern.test(text)) {
    throw invalid(`${label} harus berupa desimal ${signed ? '' : 'nonnegatif '}dengan maksimal ${precision} digit pecahan, tanpa pemisah ribuan atau notasi eksponen.`);
  }
  const negative = text.startsWith('-');
  const [integer, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '');
  if (normalizedInteger.length > maxIntegerDigits) throw invalid(`${label} terlalu besar (maksimal ${maxIntegerDigits} digit bilangan bulat).`);
  const scaled = BigInt(normalizedInteger) * (10n ** BigInt(precision)) + BigInt(fraction.padEnd(precision, '0'));
  return negative ? -scaled : scaled;
}

function fromScaled(value, precision) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(precision);
  return `${negative ? '-' : ''}${absolute / scale}.${String(absolute % scale).padStart(precision, '0')}`;
}

/** Monetary arithmetic never passes through Number, including differences below one cent. */
export function sumDecimals(values) {
  return fromScaled(values.reduce((total, value) => total + toScaled(value, 8, { signed: true, maxIntegerDigits: 24 }), 0n), 8);
}

export function subtractDecimals(left, right) {
  const options = { signed: true, maxIntegerDigits: 24 };
  return fromScaled(toScaled(left, 8, options) - toScaled(right, 8, options), 8);
}

/** BytePlus package usage can contain more fractional digits than its monetary amounts. */
export function sumUsageDecimals(values) {
  return fromScaled(values.reduce((total, value) => total + toScaled(value, 12, { signed: true, maxIntegerDigits: 24 }), 0n), 12);
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseRecords(input) {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (text.includes('\0')) throw invalid('CSV mengandung karakter NUL yang tidak valid. Ekspor ulang billing BytePlus.');
  const records = [];
  let values = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let lineNumber = 1;
  let recordLine = 1;
  const finishField = () => { values.push(field); field = ''; closedQuote = false; };
  const finishRecord = () => {
    finishField();
    // Empty physical lines are harmless; a row containing delimiters is still a data row.
    if (values.length !== 1 || values[0] !== '') records.push({ values, lineNumber: recordLine });
    if (records.length > MAX_ROWS + 1) throw invalid('CSV melebihi batas 10.000 baris data. Pecah ekspor menjadi periode yang lebih kecil.');
    values = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        field += character;
        if (character === '\n') lineNumber += 1;
      }
      continue;
    }
    if (character === ',') finishField();
    else if (character === '\n') { finishRecord(); lineNumber += 1; recordLine = lineNumber; }
    else if (character === '"' && field === '' && !closedQuote) quoted = true;
    else {
      if (closedQuote || character === '"') throw invalid(`Format kutip CSV tidak valid di baris ${lineNumber}. Ekspor ulang file tanpa mengubah tanda kutip.`);
      field += character;
    }
  }
  if (quoted) throw invalid(`Tanda kutip CSV belum ditutup pada baris ${recordLine}.`);
  if (field !== '' || values.length > 0 || closedQuote) finishRecord();
  return records;
}

function parseTime(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw invalid(`${label} harus berformat YYYY-MM-DD HH:mm:ss dalam UTC+8.`);
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (year < 1000 || local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) {
    throw invalid(`${label} berisi tanggal atau waktu yang tidak valid.`);
  }
  return new Date(local.getTime() - UTC8_OFFSET).toISOString();
}

/**
 * Parse a consumption detail export, not an invoice or package-purchase export.
 * All intervals use UTC instants and an exclusive end. The import is provider-account
 * scoped: it does not claim that any line belongs to a particular app or workspace.
 */
export function parseBytePlusBillingCsv(text) {
  if (typeof text !== 'string') throw invalid('Unggah isi CSV billing BytePlus sebagai teks UTF-8.');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw invalid('CSV melebihi batas 2 MB. Pecah ekspor menjadi file yang lebih kecil.');
  const records = parseRecords(text);
  if (records.length < 2) throw invalid('CSV harus berisi header dan setidaknya satu baris billing.');
  const headers = records[0].values.map((header) => header.trim());
  const seenHeaders = new Set();
  for (const header of headers) {
    if (!header) throw invalid('Header CSV kosong. Gunakan ekspor detail billing BytePlus asli.');
    const key = header.toLowerCase();
    if (seenHeaders.has(key)) throw invalid(`Header CSV duplikat: ${header}.`);
    seenHeaders.add(key);
  }
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw invalid(`Header billing BytePlus belum lengkap: ${missing.join(', ')}.`);
  const positions = new Map(headers.map((header, index) => [header, index]));
  let providerAccountId;
  let billingCycle;
  let cycleStart;
  let cycleEnd;
  const identities = new Set();
  const rows = [];
  for (const record of records.slice(1)) {
    const { values, lineNumber } = record;
    if (values.length !== headers.length) throw invalid(`Jumlah kolom baris ${lineNumber} tidak sesuai header (${values.length}/${headers.length}).`);
    const read = (header) => values[positions.get(header)].trim().normalize('NFC');
    const requiredText = (header) => {
      const value = read(header);
      if (!value || value === '-') throw invalid(`Kolom ${header} pada baris ${lineNumber} wajib terisi.`);
      return value;
    };
    const owner = requiredText('Owner account ID');
    if (!/^\d{1,32}$/.test(owner)) throw invalid(`Owner account ID pada baris ${lineNumber} harus berupa ID numerik BytePlus.`);
    const cycle = requiredText('Billing cycle');
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(cycle)) throw invalid(`Billing cycle pada baris ${lineNumber} harus berformat YYYY-MM.`);
    if (providerAccountId && providerAccountId !== owner) throw invalid('Satu CSV hanya boleh berisi satu Owner account ID. Pisahkan ekspor per akun provider.');
    if (billingCycle && billingCycle !== cycle) throw invalid('Satu CSV hanya boleh berisi satu Billing cycle. Pisahkan ekspor per bulan.');
    if (!providerAccountId) {
      providerAccountId = owner;
      billingCycle = cycle;
      const [year, month] = cycle.split('-').map(Number);
      cycleStart = new Date(Date.UTC(year, month - 1, 1) - UTC8_OFFSET).toISOString();
      cycleEnd = new Date(Date.UTC(year, month, 1) - UTC8_OFFSET).toISOString();
    }
    if (read('Pricing Currency') !== 'USD' || read('Payment Currency') !== 'USD') throw invalid(`Baris ${lineNumber}: Pricing Currency dan Payment Currency harus USD; konversi mata uang belum didukung.`);
    if (read('Billing mode') !== 'Pay-as-you-go' || read('Billing type') !== 'Consumption-usage') throw invalid(`Baris ${lineNumber}: hanya Pay-as-you-go / Consumption-usage yang didukung. Pisahkan pembelian paket, refund, dan koreksi billing.`);
    const periodStart = parseTime(read('Consumption start time(UTC+8)'), `Waktu mulai baris ${lineNumber}`);
    const periodEnd = parseTime(read('Consumption end time(UTC+8)'), `Waktu akhir baris ${lineNumber}`);
    if (periodStart >= periodEnd) throw invalid(`Baris ${lineNumber}: waktu mulai harus lebih awal dari waktu akhir konsumsi.`);
    if (periodStart < cycleStart || periodEnd > cycleEnd) throw invalid(`Periode konsumsi baris ${lineNumber} berada di luar Billing cycle ${cycle} (UTC+8).`);
    const numeric = (header, precision) => fromScaled(toScaled(read(header), precision, { label: `${header} pada baris ${lineNumber}` }), precision);
    const canonical = {
      product: requiredText('Product'),
      configuration: requiredText('Configuration name'),
      billingUnit: requiredText('Billing unit'),
      instanceId: requiredText('Instance ID'),
      usage: numeric('Usage', 12),
      usageUnit: requiredText('Usage unit'),
      packageUsage: numeric('Package usage', 12),
      ...Object.fromEntries(Object.entries(MONEY_FIELDS).map(([key, header]) => [key, numeric(header, 8)])),
      periodStart,
      periodEnd,
      transactionAt: parseTime(read('Transaction time(UTC+8)'), `Waktu transaksi baris ${lineNumber}`),
    };
    // Validate optional numeric columns without retaining the rest of the private export.
    for (const header of ['Price', 'Amount after discount', 'Tax rate']) {
      if (positions.has(header)) numeric(header, 8);
    }
    if (toScaled(canonical.preTaxUsd, 8) + toScaled(canonical.taxUsd, 8) !== toScaled(canonical.totalUsd, 8)) {
      throw invalid(`Baris ${lineNumber}: Pre-tax amount ditambah Tax harus sama dengan Post-tax amount. Periksa atau ekspor ulang tagihan.`);
    }
    if (toScaled(canonical.packageUsage, 12) > toScaled(canonical.usage, 12)) throw invalid(`Package usage pada baris ${lineNumber} melebihi Usage.`);
    const identityHash = fingerprint({ providerAccountId, billingCycle, currency: 'USD', ...canonical });
    if (identities.has(identityHash)) throw invalid(`Baris billing duplikat secara isi pada baris ${lineNumber}. Hapus duplikat atau ekspor ulang periode tersebut.`);
    identities.add(identityHash);
    rows.push({ lineNumber, identityHash, ...canonical });
  }
  const packageRows = rows.filter((row) => toScaled(row.packageUsage, 12) > 0n);
  const usageUnits = [...new Set(packageRows.map((row) => row.usageUnit))].sort();
  const totals = {
    ...Object.fromEntries(Object.keys(MONEY_FIELDS).map((key) => [key, sumDecimals(rows.map((row) => row[key]))])),
    packageUsageRowCount: packageRows.length,
    hasPackageUsage: packageRows.length > 0,
    packageUsageByUnit: Object.fromEntries(usageUnits.map((unit) => [unit, sumUsageDecimals(packageRows.filter((row) => row.usageUnit === unit).map((row) => row.packageUsage))])),
  };
  const warnings = [];
  if (totals.hasPackageUsage) warnings.push(`${packageRows.length} baris memakai kuota paket. Nilai tagihan nol tidak berarti COGS nol; biaya pembelian paket belum dialokasikan.`);
  if (toScaled(totals.savingsPlanGrossUsd, 8, { maxIntegerDigits: 24 }) > 0n) warnings.push('Ada pemakaian savings plan. Biaya komitmen atau pembelian savings plan belum dialokasikan ke COGS.');
  return {
    providerAccountId,
    billingCycle,
    currency: 'USD',
    periodStart: rows.reduce((start, row) => row.periodStart < start ? row.periodStart : start, rows[0].periodStart),
    periodEnd: rows.reduce((end, row) => row.periodEnd > end ? row.periodEnd : end, rows[0].periodEnd),
    rows,
    totals,
    warnings,
    fileHash: fingerprint({ providerAccountId, billingCycle, currency: 'USD', rows: [...identities].sort() }),
  };
}
