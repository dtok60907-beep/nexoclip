import { allocatePackageRequest, packageRequestBalance } from '../lib/providerPackageRequestAllocation.js';
import { requestReconciliationReadiness } from '../lib/providerReconciliationReadiness.js';
import { providerBillingAuditCsv } from '../lib/providerBillingAuditCsv.js';
import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { requirePlatformOperator } from '../lib/auth/platformOperator.js';
import { parseBytePlusBillingCsv, sumDecimals, sumUsageDecimals, subtractDecimals } from '../lib/byteplusBillingCsv.js';
import { createProviderBillingRepository } from '../repositories/providerBillingRepository.js';
import { billingGroupRates } from '../lib/providerBillingRates.js';
import { modelRateCatalog } from './modelRatesService.js';
import { getDirectProvider } from '../providers/providerRegistry.js';
import { providerBillingSummary } from '../lib/providerBillingSummary.js';
import { validatePaymentEvidence,evidenceFx } from '../lib/providerPaymentEvidence.js';
import { validateRequestReconciliation } from '../lib/providerRequestReconciliation.js';
import { calculatePackageAllocation } from '../lib/providerPackageAllocation.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const warnings = [
  'Tagihan tingkat akun provider. CSV tidak memuat ID request NexoClip; biaya belum dialokasikan ke job atau pelanggan.',
  'Pembanding mencakup seluruh request BytePlus platform pada waktu dispatch dalam rentang file. Akun provider belum dicocokkan; pemetaan SKU hanya mengelompokkan biaya per model, bukan pencocokan request final.',
  'Rentang file dapat berupa sebagian bulan. Baris yang tidak ada dalam ekspor tidak dianggap memiliki biaya nol.',
];

function preview(parsed) {
  const grouped = new Map();
  for (const row of parsed.rows) {
    const key = JSON.stringify([row.configuration,row.billingUnit,row.usageUnit]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return { fileHash:parsed.fileHash,providerAccountId:parsed.providerAccountId,billingCycle:parsed.billingCycle,
    currency:parsed.currency,periodStart:parsed.periodStart,periodEnd:parsed.periodEnd,rowCount:parsed.rows.length,
    totals:parsed.totals,packageRowCount:parsed.totals.packageUsageRowCount,
    groups:[...grouped.values()].map(rows=>billingGroupRates({configuration:rows[0].configuration,billing_unit:rows[0].billingUnit,
      usage_unit:rows[0].usageUnit,rows:rows.length,usage:sumUsageDecimals(rows.map(r=>r.usage)),
      package_usage:sumUsageDecimals(rows.map(r=>r.packageUsage)),total_usd:sumDecimals(rows.map(r=>r.totalUsd)),
      pre_tax_usd:rows.every(r=>r.preTaxUsd != null) ? sumDecimals(rows.map(r=>r.preTaxUsd)) : null,
      savings_plan_gross_usd:rows.every(r=>r.savingsPlanGrossUsd != null) ? sumDecimals(rows.map(r=>r.savingsPlanGrossUsd)) : null})),
    warnings:[...warnings,...parsed.warnings],
  };
}

export const billingSkuKey = group => hash([group.configuration,group.billing_unit,group.usage_unit]);
function comparisonFor(bill, rows, mappings = []) {
  const knownCostUsd = sumDecimals(rows.map(r=>r.known_cost_usd));
  const facts = { fileHash:bill.file_hash,environment:bill.environment || 'unclassified',periodStart:bill.period_start,periodEnd:bill.period_end,rows,mappings };
  return { requests:rows.reduce((n,r)=>n+Number(r.requests),0),knownCostUsd,
    unknownRequests:rows.reduce((n,r)=>n+Number(r.unknown_requests),0),
    missingDispatchRequests:rows.reduce((n,r)=>n+Number(r.missing_dispatch_requests),0),
    rows,differenceUsd:subtractDecimals(bill.pre_tax_usd,knownCostUsd),hash:hash(facts),observedAt:new Date().toISOString(),
    allocationStatus:'unallocated',scope:'platform_byteplus_dispatch_comparator' };
}

export function createProviderBillingService({ repository, env=process.env, parse=parseBytePlusBillingCsv,
  catalog=()=>[...new Set(modelRateCatalog().map(row=>row.model).filter(model=>getDirectProvider(model)?.provider==='byteplus'))].sort() }={}) {
  const repo = () => repository || createProviderBillingRepository(getPool());
  function validateEnvironment(environment,account) {
    if (!['development','production'].includes(environment)) throw fail('Lingkungan billing tidak valid');
    const productionAccount=String(env.BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID || '').trim();
    if (environment==='production' && (!/^[0-9]{1,32}$/.test(productionAccount) || productionAccount!==account)) throw fail('Akun billing production belum dikonfigurasi atau tidak cocok',409);
    if (environment==='development' && productionAccount && productionAccount===account) throw fail('Akun production tidak boleh diklasifikasikan sebagai development',409);
  }
  return {
    async exportReconciliation({userId,id}) {
      requirePlatformOperator(userId,env);
      if(!uuid(id))throw fail('ID tagihan tidak valid');
      const snapshot=await repo().reconciliationExportSnapshot(id);
      return {filename:`byteplus-reconciliation-${id.toLowerCase()}.csv`,csv:providerBillingAuditCsv({...snapshot,groups:snapshot.groups.map(group=>({...group,groupKey:billingSkuKey(group)}))})};
    },
    async read({userId,id,page=1,environment='all',requestPage=1,requestSearch='',requestStatus='all',jobId=null,workspaceId=null}) {
      requirePlatformOperator(userId,env);
      const r=repo();
      const scoped=jobId!==null || workspaceId!==null;
      if(scoped && (!uuid(jobId) || !uuid(workspaceId)))throw fail('Job dan workspace harus berupa ID yang valid');
      if(scoped && !id) {
        const context=await r.jobBillingContext(workspaceId,jobId);
        if(!context)throw fail('Job tidak ditemukan pada workspace ini',404);
        return context;
      }
      if (id) {
        if(!['all','unreconciled','reconciled','corrected'].includes(requestStatus))throw fail('Status rekonsiliasi request tidak valid');
        if(!/^[1-9][0-9]{0,5}$/.test(String(requestPage)) || Number(requestPage)>100000)throw fail('Halaman request tidak valid');
        if(typeof requestSearch!=='string' || requestSearch.length>128 || /[\x00-\x1f\x7f]/.test(requestSearch))throw fail('Pencarian request maksimal 128 karakter tanpa karakter kontrol');
        if (!uuid(id)) throw fail('ID tagihan tidak valid');
        const detail=await r.detail(id);
        if (!detail) throw fail('Tagihan tidak ditemukan',404);
        const rows=await r.comparison(detail.bill);
        const mappings=await r.mappings?.(id) || [];
        const accountCoverage=await r.accountCoverage?.(detail.bill) || null;
        const requestInventoryRaw=await r.requestInventory?.(detail.bill,undefined,{page:Number(requestPage),search:requestSearch.trim(),status:requestStatus,...(scoped?{jobId,workspaceId}:{})}) || null;
        const paymentEvidence=(await r.paymentEvidence?.(id) || []).map(row=>({...row,effectiveFx:evidenceFx(row)}));
        const requestCorrectionHistory=await r.requestCorrectionHistory?.(id) || [];
        const requestReconciliations=await r.requestReconciliations?.(id) || [];
        const packageAllocations=(await r.packageAllocations?.(id) || []).map(row=>({...row,...packageRequestBalance(row,requestReconciliations)}));
        const accountRows=accountCoverage ? await r.comparison(detail.bill,undefined,true) : [];
        const accountComparison=accountCoverage ? {...comparisonFor(detail.bill,accountRows,mappings),scope:'verified_billing_account_dispatch_comparator'} : null;
        const comparison=comparisonFor(detail.bill,rows,mappings);
        const groups=detail.groups.map(group=>{
          const groupKey=billingSkuKey(group);
          const mapping=mappings.find(row=>row.group_key===groupKey);
          return {...billingGroupRates(group),groupKey,mapping:mapping || null};
        });
        const requestInventory=requestInventoryRaw ? {...requestInventoryRaw,rows:requestInventoryRaw.rows.map(request=>({...request,readiness:requestReconciliationReadiness({bill:detail.bill,request,groups,payments:paymentEvidence}),packageReadiness:requestReconciliationReadiness({bill:detail.bill,request,groups,payments:paymentEvidence,mode:'package',allocations:packageAllocations})}))} : null;
        return {...detail,mappings,paymentEvidence,packageAllocations,requestReconciliations,requestCorrectionHistory,accountCoverage,accountComparison,requestInventory,modelOptions:catalog(),groups,modelSummary:providerBillingSummary(groups,rows),comparison,warnings:[...warnings.map((warning,index)=>index===0 && requestReconciliations.length ? `${requestReconciliations.length} request sudah dicocokkan berdasarkan bukti admin. Sisa tagihan belum dialokasikan; CSV agregat tidak memuat request ID.` : warning),
          ...(comparison.missingDispatchRequests>0?[`${comparison.missingDispatchRequests} request tidak memiliki waktu dispatch; pembanding memakai tanggal pencatatan sebagai fallback.`]:[]),
          ...(comparison.unknownRequests>0?[`${comparison.unknownRequests} request belum memiliki biaya. Selisih hanya membandingkan komponen biaya yang diketahui.`]:[]),
          ...(detail.bill.package_row_count>0?['Penggunaan paket terdeteksi. Nilai tagihan nol belum mencakup biaya pembelian paket; COGS penuh belum diketahui.']:[]),
          ...(Number(detail.bill.savings_plan_gross_usd)>0?['Pemakaian savings plan terdeteksi. Biaya komitmen/pembelian plan belum dialokasikan.']:[])]};
      }
      if (!/^\d+$/.test(String(page)) || !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>100000) throw fail('Halaman tidak valid');
      if (!['all','development','production','unclassified'].includes(environment)) throw fail('Filter lingkungan tidak valid');
      const data=await r.list(Number(page),20,environment);
      return {...data,environment,pagination:{page:Number(page),total:data.total,totalPages:Math.max(1,Math.ceil(data.total/20))}};
    },
    async mutate({userId,input}) {
      requirePlatformOperator(userId,env);
      if (!input || typeof input!=='object' || Array.isArray(input)) throw fail('Permintaan tidak valid');
      if (input.action==='preview' || input.action==='import') {
        const parsed=parse(input.csv);
        const r=repo();
        if (input.action==='preview') return {preview:preview(parsed),duplicateId:(await r.duplicate(parsed.fileHash))?.id||null};
        if (input.expectedHash!==parsed.fileHash) throw fail('File berubah. Buat pratinjau ulang sebelum menyimpan.',409);
        const reference=typeof input.reference==='string'?input.reference.trim():'';
        if (reference.length<3 || reference.length>160) throw fail('Referensi tagihan harus 3–160 karakter');
        const environment=input.environment || 'development';
        validateEnvironment(environment,parsed.providerAccountId);
        return r.transaction(async db=>{
          await r.lockAccount(db,parsed.providerAccountId);
          const existing=await r.duplicate(parsed.fileHash,db);
          if (existing) return {id:existing.id,replayed:true};
          if (await r.overlapping(db,parsed)) throw fail('Rentang ekspor bertumpang tindih dengan tagihan tersimpan. Gunakan file tanpa periode tumpang tindih; koreksi tagihan memerlukan rekonsiliasi terpisah.',409);
          const created=await r.insert(db,{parsed,userId,reference});
          await r.classifyEnvironment(db,{id:created.id,environment,note:'Lingkungan dipilih saat impor billing',userId});
          return {id:created.id,replayed:false};
        });
      }
      if(input.action==='correct-request-cost') {
        if(!uuid(input.id) || ![input.reconciliationId,input.previousCostEventId,input.paymentId].every(value=>typeof value==='string' && /^[1-9][0-9]{0,18}$/.test(value)))throw fail('ID pencocokan, versi biaya, atau pembayaran tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          const initial=await r.detail(input.id,db);
          if(!initial)throw fail('Tagihan tidak ditemukan',404);
          await r.lockAccount(db,initial.bill.provider_account_id);
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          const parent=await r.requestReconciliationById(input.reconciliationId,input.id,db);
          if(!parent)throw fail('Pencocokan tidak ditemukan pada tagihan ini',404);
          if((await r.packageRequestAllocations?.(input.id,db)||[]).some(row=>row.reconciliation_id===parent.id))throw fail('Koreksi alokasi paket per request belum didukung; bukti awal tetap tersimpan',409);
          const request=await r.requestObservation(parent.cost_event_id,db);
          if(request && Number(request.matching_jobs)!==1)throw fail('Request terhubung ke beberapa job; perlu pemeriksaan manual',409);
          const group=detail.groups.find(row=>billingSkuKey(row)===input.groupKey);
          if(!group)throw fail('SKU tidak ditemukan');
          const mapping=(await r.mappings(input.id,db)).find(row=>row.group_key===input.groupKey);
          const payment=(await r.paymentEvidence(input.id,db)).find(row=>row.id===input.paymentId);
          const rows=await r.requestReconciliations(input.id,db);
          const others=rows.filter(row=>row.id!==parent.id && row.group_key===input.groupKey);
          const history=await r.requestCorrectionHistory(input.id,db);
          const existing=history.find(row=>row.reconciliation_id===parent.id && row.previous_cost_event_id===input.previousCostEventId);
          const evidence=validateRequestReconciliation({bill:detail.bill,request,group,mapping,payment,allocatedUsd:existing ? '0' : sumDecimals(others.map(row=>row.cost_usd)),input});
          if(existing) {
            if(existing.payment_evidence_id!==input.paymentId || existing.group_key!==input.groupKey || existing.cost_usd!==evidence.costUsd || existing.evidence_reference!==evidence.evidenceReference || existing.note!==evidence.note)throw fail('Versi biaya sudah dikoreksi dengan nilai berbeda; muat ulang',409);
            return {corrected:true,replayed:true};
          }
          const current=rows.find(row=>row.id===parent.id);
          if(!current || current.current_cost_event_id!==input.previousCostEventId)throw fail('Versi biaya berubah; muat ulang sebelum mengoreksi',409);
          await r.correctRequestCost(db,{parent,previousCostEventId:input.previousCostEventId,paymentId:input.paymentId,groupKey:input.groupKey,request,evidence,fingerprint:hash({reconciliation:parent.id,previous:input.previousCostEventId,evidence}),userId});
          return {corrected:true,replayed:false};
        });
      }
      if(input.action==='correct-package-request') {
        if(!uuid(input.id)||![input.reconciliationId,input.previousCostEventId].every(value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)))throw fail('ID pencocokan atau versi biaya tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          const initial=await r.detail(input.id,db);
          if(!initial)throw fail('Tagihan tidak ditemukan',404);
          await r.lockAccount(db,initial.bill.provider_account_id);
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          const parent=await r.requestReconciliationById(input.reconciliationId,input.id,db);
          if(!parent)throw fail('Pencocokan tidak ditemukan',404);
          const rows=await r.packageRequestAllocations(input.id,db);
          const current=rows.find(row=>row.reconciliation_id===parent.id);
          if(!current)throw fail('Request bukan alokasi paket',409);
          const allocation=(await r.packageAllocations(input.id,db)).find(row=>row.id===current.package_allocation_id);
          const group=detail.groups.find(row=>billingSkuKey(row)===allocation?.group_key);
          if(!group)throw fail('SKU paket tidak ditemukan');
          const mapping=(await r.mappings(input.id,db)).find(row=>row.group_key===allocation.group_key);
          const payment=(await r.paymentEvidence(input.id,db)).find(row=>row.id===allocation.payment_evidence_id);
          const request=await r.requestObservation(parent.cost_event_id,db);
          const history=await r.requestCorrectionHistory(input.id,db);
          const existing=history.find(row=>row.reconciliation_id===parent.id&&row.previous_cost_event_id===input.previousCostEventId);
          if(!existing&&current.current_cost_event_id!==input.previousCostEventId)throw fail('Versi biaya berubah; muat ulang sebelum mengoreksi',409);
          const others=rows.filter(row=>row.reconciliation_id!==parent.id&&row.package_allocation_id===allocation.id);
          const evidence=allocatePackageRequest({bill:detail.bill,request,group,mapping,payment,allocation,rows:existing?[]:others,input:{...input,groupKey:allocation.group_key},allowZero:true,recordedCost:existing});
          if(existing) {
            if(existing.package_allocation_id!==allocation.id||existing.package_consumed_quota!==evidence.consumedQuota||existing.evidence_reference!==evidence.evidenceReference||existing.note!==evidence.note)throw fail('Versi biaya sudah dikoreksi dengan bukti berbeda',409);
            return {corrected:true,replayed:true};
          }
          if(current.current_cost_event_id!==input.previousCostEventId)throw fail('Versi biaya berubah; muat ulang sebelum mengoreksi',409);
          const correction=await r.correctRequestCost(db,{parent,previousCostEventId:input.previousCostEventId,paymentId:payment.id,groupKey:allocation.group_key,request,evidence,fingerprint:hash({reconciliation:parent.id,previous:input.previousCostEventId,evidence}),userId});
          await r.recordPackageRequestCorrection(db,{correctionId:correction.id,allocationId:allocation.id,previousQuota:current.consumed_quota,consumedQuota:evidence.consumedQuota});
          return {corrected:true,replayed:false};
        });
      }
      if(input.action==='allocate-package-request') {
        if(!uuid(input.id)||![input.observationId,input.allocationId].every(value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)))throw fail('ID request atau alokasi paket tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          const initial=await r.detail(input.id,db);
          if(!initial)throw fail('Tagihan tidak ditemukan',404);
          await r.lockAccount(db,initial.bill.provider_account_id);
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          const request=await r.requestObservation(input.observationId,db);
          const allocation=(await r.packageAllocations(input.id,db)).find(row=>row.id===input.allocationId);
          if(!allocation)throw fail('Alokasi paket tidak ditemukan pada tagihan ini',404);
          const group=detail.groups.find(row=>billingSkuKey(row)===allocation.group_key);
          if(!group)throw fail('SKU paket tidak ditemukan');
          const mapping=(await r.mappings(input.id,db)).find(row=>row.group_key===allocation.group_key);
          const payment=(await r.paymentEvidence(input.id,db)).find(row=>row.id===allocation.payment_evidence_id);
          const existing=request?await r.reconciliationForRequest(request.provider_account_id,request.provider_request_id,db):null;
          const rows=await r.packageRequestAllocations(input.id,db);
          const prior=rows.find(row=>row.provider_request_id===request?.provider_request_id);
          const assigned=existing?[]:rows.filter(row=>row.package_allocation_id===allocation.id);
          const evidence=allocatePackageRequest({bill:detail.bill,request,group,mapping,payment,allocation,rows:assigned,input:{...input,groupKey:allocation.group_key},recordedCost:existing&&prior?{cost_usd:prior.original_cost_usd,cost_idr:prior.original_cost_idr}:undefined});
          if(existing) {
            if(existing.import_id!==input.id||!prior||prior.package_allocation_id!==allocation.id||prior.initial_consumed_quota!==evidence.consumedQuota||prior.initial_evidence_reference!==evidence.evidenceReference||prior.initial_note!==evidence.note)throw fail('Request sudah memiliki pencocokan dengan bukti berbeda',409);
            return {allocated:true,replayed:true};
          }
          const created=await r.reconcileRequest(db,{id:input.id,paymentId:payment.id,groupKey:allocation.group_key,request,evidence,fingerprint:hash({billing:input.id,allocation:allocation.id,request:request.provider_request_id,evidence}),userId});
          await r.recordPackageRequestAllocation(db,{reconciliationId:created.id,allocationId:allocation.id,consumedQuota:evidence.consumedQuota});
          return {allocated:true,replayed:false};
        });
      }
      if(input.action==='reconcile-request') {
        if(!uuid(input.id) || !/^[1-9][0-9]{0,18}$/.test(String(input.observationId)) || !/^[1-9][0-9]{0,18}$/.test(String(input.paymentId)))throw fail('ID request atau bukti pembayaran tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          const initial=await r.detail(input.id,db);
          if(!initial)throw fail('Tagihan tidak ditemukan',404);
          await r.lockAccount(db,initial.bill.provider_account_id);
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          const request=await r.requestObservation(input.observationId,db);
          if(request && Number(request.matching_jobs)!==1)throw fail('Request provider terhubung ke beberapa job; perlu pemeriksaan manual',409);
          const group=detail.groups.find(row=>billingSkuKey(row)===input.groupKey);
          if(!group)throw fail('SKU tidak ditemukan');
          const mapping=(await r.mappings(input.id,db)).find(row=>row.group_key===input.groupKey);
          const payment=(await r.paymentEvidence(input.id,db)).find(row=>row.id===String(input.paymentId));
          const existing=request ? await r.reconciliationForRequest(request.provider_account_id,request.provider_request_id,db) : null;
          if(existing && existing.import_id!==input.id)throw fail('Request sudah dicocokkan pada tagihan lain',409);
          const rows=(await r.requestReconciliations(input.id,db)).filter(row=>row.group_key===input.groupKey && row.provider_request_id!==request?.provider_request_id);
          const evidence=validateRequestReconciliation({bill:detail.bill,request,group,mapping,payment,allocatedUsd:existing ? '0' : sumDecimals(rows.map(row=>row.cost_usd)),input});
          if(existing) {
            if(existing.group_key!==input.groupKey || existing.payment_evidence_id!==String(input.paymentId) || existing.cost_usd!==evidence.costUsd || existing.evidence_reference!==evidence.evidenceReference || existing.note!==evidence.note)throw fail('Pencocokan sudah tersimpan dengan bukti berbeda',409);
            return {reconciled:true,replayed:true};
          }
          await r.reconcileRequest(db,{id:input.id,paymentId:input.paymentId,groupKey:input.groupKey,request,evidence,fingerprint:hash({billing:input.id,request:request.provider_request_id,evidence}),userId});
          return {reconciled:true,replayed:false};
        });
      }
      if(input.action==='allocate-package') {
        if(!uuid(input.id) || typeof input.paymentId!=='string' || !/^[1-9][0-9]{0,18}$/.test(input.paymentId))throw fail('ID bukti paket tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          if(!detail)throw fail('Tagihan tidak ditemukan',404);
          if(!['development','production'].includes(detail.bill.environment))throw fail('Lingkungan tagihan belum diklasifikasi',409);
          const payment=(await r.paymentEvidence(input.id,db)).find(row=>row.id===input.paymentId);
          if(!payment)throw fail('Bukti paket tidak ditemukan pada tagihan');
          const group=detail.groups.find(row=>billingSkuKey(row)===input.groupKey);
          if(!group)throw fail('SKU tidak ditemukan');
          const allocations=await r.packageAllocations(input.id,db);
          const existing=allocations.find(row=>row.payment_evidence_id===input.paymentId && row.group_key===input.groupKey);
          const allocation=calculatePackageAllocation({payment,group,allocations:existing ? allocations.filter(row=>row.id!==existing.id) : allocations,input});
          if(existing) {
            if(existing.total_quota!==allocation.totalQuota || existing.consumed_quota!==allocation.consumedQuota || existing.note!==allocation.note)throw fail('Alokasi sudah tersimpan dengan nilai berbeda dan tidak dapat ditimpa',409);
            return {allocated:true,replayed:true};
          }
          await r.allocatePackage(db,{id:input.id,paymentId:input.paymentId,groupKey:input.groupKey,allocation,userId});
          return {allocated:true,replayed:false};
        });
      }
      if (input.action==='payment-evidence') {
        if (!uuid(input.id)) throw fail('ID tagihan tidak valid');
        const evidence=validatePaymentEvidence(input);
        const r=repo();
        return r.transaction(async db=>{
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          if(!detail)throw fail('Tagihan tidak ditemukan',404);
          if(!['development','production'].includes(detail.bill.environment))throw fail('Klasifikasikan lingkungan tagihan sebelum mencatat pembayaran',409);
          const rows=await r.paymentEvidence(input.id,db);
          const existing=rows.find(row=>row.kind===evidence.kind && row.reference===evidence.reference);
          if(existing) {
            const identical=existing.amount_usd===evidence.amountUsd && existing.amount_idr===evidence.amountIdr && new Date(existing.paid_at).toISOString()===evidence.paidAt && existing.note===evidence.note;
            if(!identical)throw fail('Referensi sudah tercatat dengan nilai berbeda; bukti tidak dapat ditimpa',409);
            return {recorded:true,replayed:true};
          }
          if(evidence.kind==='invoice_payment') {
            const total=sumDecimals([...rows.filter(row=>row.kind==='invoice_payment').map(row=>row.amount_usd),evidence.amountUsd]);
            if(subtractDecimals(detail.bill.total_usd,total).startsWith('-'))throw fail('Total pembayaran USD melebihi nilai tagihan; catat biaya paket secara terpisah',409);
          }
          await r.addPaymentEvidence(db,{id:input.id,evidence,userId});
          return {recorded:true,replayed:false};
        });
      }
      if (input.action==='classify-environment') {
        if (!uuid(input.id)) throw fail('ID tagihan tidak valid');
        const note=typeof input.note==='string'?input.note.trim():'';
        if (note.length<10 || note.length>2000) throw fail('Alasan klasifikasi harus 10–2.000 karakter');
        const r=repo();
        return r.transaction(async db=>{
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          if (!detail) throw fail('Tagihan tidak ditemukan',404);
          validateEnvironment(input.environment,detail.bill.provider_account_id);
          if (detail.bill.environment===input.environment) return {classified:true,replayed:true};
          if (detail.bill.environment!=='unclassified') throw fail('Lingkungan sudah tercatat dan tidak dapat ditimpa',409);
          await r.classifyEnvironment(db,{id:input.id,environment:input.environment,note,userId});
          return {classified:true,replayed:false};
        });
      }
      if (input.action==='map-sku') {
        if (!uuid(input.id)) throw fail('ID tagihan tidak valid');
        const note=typeof input.note==='string'?input.note.trim():'';
        if (note.length<10 || note.length>2000) throw fail('Alasan pemetaan harus 10–2.000 karakter');
        if (input.model!==null && !catalog().includes(input.model)) throw fail('Pilih model BytePlus dari katalog');
        if (typeof input.expectedMappingId!=='string') throw fail('Versi pemetaan tidak valid');
        const r=repo();
        return r.transaction(async db=>{
          await r.lockImport(db,input.id);
          const detail=await r.detail(input.id,db);
          if (!detail) throw fail('Tagihan tidak ditemukan',404);
          const group=detail.groups.find(row=>billingSkuKey(row)===input.groupKey);
          if (!group) throw fail('SKU tidak ditemukan pada tagihan');
          const mappings=await r.mappings(input.id,db);
          const current=mappings.find(row=>row.group_key===input.groupKey);
          if ((current?.id || '')!==input.expectedMappingId) throw fail('Pemetaan berubah. Muat ulang sebelum menyimpan.',409);
          if ((current?.model || null)===input.model) return {mapped:true,replayed:true};
          await r.mapSku(db,{id:input.id,groupKey:input.groupKey,group,model:input.model,note,userId});
          return {mapped:true,replayed:false};
        });
      }
      if (input.action==='review') {
        if (!uuid(input.id)) throw fail('ID tagihan tidak valid');
        const note=typeof input.note==='string'?input.note.trim():'';
        if (note.length<10 || note.length>2000) throw fail('Catatan tinjauan harus 10–2.000 karakter');
        const r=repo();
        return r.transaction(async db=>{
          const detail=await r.detail(input.id,db);
          if (!detail) throw fail('Tagihan tidak ditemukan',404);
          await r.lockImport?.(db,input.id);
          const comparison=comparisonFor(detail.bill,await r.comparison(detail.bill,db),await r.mappings?.(input.id,db)||[]);
          if (comparison.hash!==input.expectedComparisonHash) throw fail('Data usage berubah. Muat ulang dan periksa pembanding sebelum meninjau.',409);
          await r.review(db,{id:input.id,note,comparison,reviewHash:hash([input.id,note,comparison.hash,userId]),userId});
          return {reviewed:true};
        });
      }
      throw fail('Tindakan tidak dikenal');
    },
  };
}
export const providerBillingService=createProviderBillingService();
