// Format PostgreSQL NUMERIC strings without losing decimal precision.
export function credits(value) {
  if (value === null || value === undefined || value === '') return '—';
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 }) : String(value);
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  const sign = match[1] && (integer !== '0' || fraction) ? '-' : '';
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''}`;
}
export function idr(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'Belum diketahui';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));
}
export function margin(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Belum lengkap';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(Number(value))}%`;
}
export function coverageReasons(coverage = {}) {
  const reasons = [];
  if (coverage.unknownRevenueCredits > 0) reasons.push(`${credits(coverage.unknownRevenueCredits)} kredit belum diketahui nilainya`);
  if (coverage.unknownPaymentFeeCredits > 0) reasons.push('Biaya pembayaran belum direkonsiliasi');
  if (coverage.unknownProviderRequests > 0) reasons.push(`${coverage.unknownProviderRequests} request belum diketahui biayanya`);
  if (coverage.unknownFxRequests > 0) reasons.push('Kurs biaya provider belum diketahui');
  if (coverage.unobservedCostJobs > 0) reasons.push(`${coverage.unobservedCostJobs} job belum memiliki catatan biaya request`);
  if (coverage.provisionalProviderRequests > 0) reasons.push(`${coverage.provisionalProviderRequests} biaya request masih sementara`);
  if (coverage.missingAttemptCount > 0) reasons.push(`${coverage.missingAttemptCount} attempt belum tercatat`);
  if (coverage.pendingSettlementJobs > 0) reasons.push('Settlement kredit belum selesai');
  if (coverage.allocationMismatchJobs > 0) reasons.push('Alokasi kredit perlu diperiksa');
  return reasons;
}
export function economicsPath({ from, to, groupBy, page = 1,environment }) {
  return `/api/admin/economics?${new URLSearchParams({ from, to, groupBy, page: String(page), pageSize: '25',...(environment ? {environment} : {}) })}`;
}
