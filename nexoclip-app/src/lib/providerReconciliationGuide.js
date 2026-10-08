// Guidance uses server-assessed prerequisites; it never approves a charge or
// invents request evidence from an aggregate invoice.
const destinations = {
  missing_mapping: { href: '#provider-sku-mapping', label: 'Buka pemetaan SKU' },
  missing_payment: { href: '#provider-payment-evidence', label: 'Buka bukti pembayaran' },
  account_mismatch: { href: '#provider-billing-imports', label: 'Pilih tagihan lain' },
  environment_mismatch: { href: '#provider-billing-imports', label: 'Pilih tagihan lain' },
  outside_period: { href: '#provider-billing-imports', label: 'Pilih tagihan lain' },
};
function path(readiness, mode) {
  const packageMode = mode === 'package';
  const ready = readiness?.canReconcile === true;
  return {
    mode, label: packageMode ? 'Penggunaan paket' : 'Biaya langsung per request', ready,
    href: packageMode ? '#provider-package-request' : '#provider-request-reconciliation',
    evidence: packageMode
      ? 'Siapkan bukti usage BytePlus yang menyebut request ID, paket, SKU, satuan, dan kuota yang digunakan.'
      : 'Siapkan bukti BytePlus yang menyebut request ID dan biaya USD sebelum pajak. CSV agregat saja belum cukup.',
    blockers: (readiness?.reasons || []).map(reason => ({ ...reason,
      ...(reason.code === 'package_unsupported' && packageMode
        ? { href: '#provider-package-allocation', label: 'Periksa alokasi dan sisa kuota paket' }
        : destinations[reason.code] || {}),
    })),
  };
}
export function requestReconciliationGuide(request = {}) {
  if (['reconciled', 'corrected'].includes(request.reconciliation_status)) {
    return { status: 'recorded', paths: [], corrections: [
      { href: '#provider-cost-corrections', label: 'Koreksi biaya langsung' },
      { href: '#provider-package-corrections', label: 'Koreksi usage paket' },
    ] };
  }
  const paths = [path(request.readiness, 'direct'), path(request.packageReadiness, 'package')];
  const readyPaths = paths.filter(item => item.ready);
  return { status: readyPaths.length ? 'ready' : request.readiness || request.packageReadiness ? 'blocked' : 'unavailable',
    paths: readyPaths.length ? readyPaths : paths, corrections: [] };
}
