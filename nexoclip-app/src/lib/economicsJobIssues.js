export const economicsIssueCategories = [
  {code:'unknown_provider',label:'Biaya request belum diketahui',coverageKey:'unknownProviderRequests',action:'Periksa biaya dan bukti provider per request.',provider:true},
  {code:'unknown_fx',label:'Kurs provider belum tersedia',coverageKey:'unknownFxRequests',action:'Periksa bukti pembayaran provider dan kurs yang digunakan.',provider:true},
  {code:'unobserved_cost',label:'Catatan biaya request belum ada',coverageKey:'unobservedCostJobs',action:'Periksa pencatatan dispatch dan respons provider sebelum mencocokkan biaya.',provider:true},
  {code:'missing_attempt',label:'Attempt belum tercatat lengkap',coverageKey:'missingAttemptCount',action:'Periksa log retry dan fallback; seluruh request perlu dicatat.',provider:true},
  {code:'provisional_cost',label:'Biaya request masih sementara',coverageKey:'provisionalProviderRequests',action:'Periksa status akhir request dan bukti biaya provider.',provider:true},
  {code:'provider_evidence',label:'Bukti biaya belum dicocokkan',action:'Cocokkan biaya atau usage paket dengan bukti per request.',provider:true},
  {code:'unknown_revenue',label:'Nilai kredit terpakai belum diketahui',coverageKey:'unknownRevenueCredits',action:'Periksa sumber kredit, harga penjualan, dan alokasi kredit job.'},
  {code:'unknown_fee',label:'Biaya pembayaran customer belum lengkap',coverageKey:'unknownPaymentFeeCredits',action:'Catat biaya gateway sesuai bukti pembayaran customer.',href:'#economics-payment-fees'},
  {code:'pending_settlement',label:'Settlement kredit masih pending',coverageKey:'pendingSettlementJobs',action:'Periksa penyelesaian job dan settlement kredit.'},
  {code:'allocation_mismatch',label:'Alokasi kredit tidak sesuai pemakaian',coverageKey:'allocationMismatchJobs',action:'Periksa ledger dan alokasi kredit sebelum mengakui pendapatan.'},
];
export function economicsJobIssues(row = {}) {
  return economicsIssueCategories.filter(category => category.code === 'provider_evidence'
    ? row.costEvidence?.available === true && Number(row.providerRequestCount) > Number(row.costEvidence.matched?.requests || 0) + Number(row.costEvidence.packageMatched?.requests || 0)
    : Number(row.coverage?.[category.coverageKey]) > 0);
}
export function mapEconomicsAttention(raw) {
  if(!raw)return {available:false};
  return {available:true,totalJobs:Number(raw.total_jobs || 0),attentionJobs:Number(raw.attention_jobs || 0),
    categories:economicsIssueCategories.map(({code,label})=>({code,label,jobs:Number(raw[code] || 0)}))};
}

export const economicsIssueFilters = [{value:'all',label:'Semua penyebab'},{value:'any',label:'Semua job yang perlu diperiksa'},...economicsIssueCategories.map(({code,label})=>({value:code,label}))];
export const isEconomicsIssueFilter = value => typeof value==='string' && economicsIssueFilters.some(option=>option.value===value);
export const economicsIssueFilterLabel = value => economicsIssueFilters.find(option=>option.value===value)?.label || 'Semua penyebab';
