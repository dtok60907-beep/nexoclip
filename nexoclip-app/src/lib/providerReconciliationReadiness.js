const environments = new Set(['development', 'production']);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

function timestamp(value) {
  if (!(value instanceof Date) && !hasText(value)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function matchingJobs(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return null;
}

// Availability of prerequisites only; invoice proof and the proposed charge still
// require validation when the operator submits a reconciliation.
export function requestReconciliationReadiness({ bill = {}, request = {}, groups = [], payments = [] } = {}) {
  bill ||= {};
  request ||= {};
  const reasons = [];
  const add = (code, message) => reasons.push({ code, message });

  const billEnvironmentKnown = environments.has(bill.environment);
  const jobEnvironmentKnown = environments.has(request.environment);
  if (!billEnvironmentKnown) add('unclassified_bill', 'Klasifikasikan lingkungan tagihan terlebih dahulu.');
  if (!hasText(request.provider_request_id)) add('missing_request_id', 'ID request provider belum tersedia; periksa pencatatan request.');
  if (!hasText(request.provider_account_id) || !hasText(bill.provider_account_id)) {
    add('missing_account', 'Identitas akun provider belum tersedia; lengkapi pencatatan akun.');
  } else if (request.provider_account_id !== bill.provider_account_id) {
    add('account_mismatch', 'Akun request berbeda dari tagihan; pilih tagihan akun yang sesuai.');
  }
  if (!jobEnvironmentKnown) {
    add('missing_job_environment', 'Lingkungan job belum diketahui; periksa pencatatan job.');
  } else if (billEnvironmentKnown && request.environment !== bill.environment) {
    add('environment_mismatch', 'Lingkungan job berbeda dari tagihan; pilih tagihan yang sesuai.');
  }

  const requestTime = timestamp(request.request_time);
  const periodStart = timestamp(bill.period_start);
  const periodEnd = timestamp(bill.period_end);
  if (request.time_is_fallback !== false) add('missing_dispatch', 'Waktu dispatch belum diketahui; lengkapi bukti dispatch request.');
  if (requestTime === null) add('invalid_dispatch_time', 'Waktu dispatch tidak valid; periksa pencatatan request.');
  if (periodStart === null || periodEnd === null || periodStart >= periodEnd) {
    add('invalid_period', 'Periode tagihan tidak valid; periksa rentang waktu tagihan.');
  } else if (requestTime !== null && (requestTime < periodStart || requestTime >= periodEnd)) {
    add('outside_period', 'Dispatch berada di luar periode tagihan; pilih tagihan dengan periode yang sesuai.');
  }

  const jobs = matchingJobs(request.matching_jobs);
  if (jobs === null || jobs === 0n) {
    add('identity_unverified', 'Hubungan request dengan job belum terverifikasi; periksa identitas request.');
  } else if (jobs > 1n) {
    add('ambiguous_request', 'Request terhubung ke beberapa job; periksa pencatatan identitas request.');
  }
  if (['reconciled', 'corrected'].includes(request.reconciliation_status)) {
    add('use_correction', 'Request sudah dicocokkan; gunakan koreksi biaya untuk mengubahnya.');
  }
  if (hasText(request.other_reconciliation_import_id)) {
    add('already_reconciled_other_invoice', 'Request sudah dicocokkan pada tagihan lain; periksa pencocokan sebelumnya.');
  }

  const mappedGroups = Array.isArray(groups) && hasText(request.model)
    ? groups.filter(group => group?.mapping?.model === request.model)
    : [];
  const eligibleGroups = mappedGroups.filter(group => !(Number(group.package_usage) > 0 || Number(group.savings_plan_gross_usd) > 0));
  if (!mappedGroups.length) {
    add('missing_mapping', 'Petakan SKU tagihan ke model job terlebih dahulu.');
  } else if (!eligibleGroups.length) {
    add('package_unsupported', 'Semua SKU model memakai paket atau savings plan; pencocokan request langsung belum didukung.');
  }
  if (!Array.isArray(payments) || !payments.some(payment => payment?.kind === 'invoice_payment')) {
    add('missing_payment', 'Tambahkan bukti pembayaran tagihan untuk dasar kurs terlebih dahulu.');
  }

  return {
    canReconcile: reasons.length === 0,
    reasons,
    eligibleGroupKeys: [...new Set(eligibleGroups.map(group => group.groupKey))],
  };
}
