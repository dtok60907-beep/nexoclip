import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { requirePlatformOperator } from '../lib/auth/platformOperator.js';
import { parseBytePlusBillingCsv, sumDecimals, sumUsageDecimals, subtractDecimals } from '../lib/byteplusBillingCsv.js';
import { createProviderBillingRepository } from '../repositories/providerBillingRepository.js';
import { billingGroupRates } from '../lib/providerBillingRates.js';
import { modelRateCatalog } from './modelRatesService.js';
import { getDirectProvider } from '../providers/providerRegistry.js';
import { providerBillingSummary } from '../lib/providerBillingSummary.js';

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
    async read({userId,id,page=1,environment='all'}) {
      requirePlatformOperator(userId,env);
      const r=repo();
      if (id) {
        if (!uuid(id)) throw fail('ID tagihan tidak valid');
        const detail=await r.detail(id);
        if (!detail) throw fail('Tagihan tidak ditemukan',404);
        const rows=await r.comparison(detail.bill);
        const mappings=await r.mappings?.(id) || [];
        const accountCoverage=await r.accountCoverage?.(detail.bill) || null;
        const requestInventory=await r.requestInventory?.(detail.bill) || null;
        const accountRows=accountCoverage ? await r.comparison(detail.bill,undefined,true) : [];
        const accountComparison=accountCoverage ? {...comparisonFor(detail.bill,accountRows,mappings),scope:'verified_billing_account_dispatch_comparator'} : null;
        const comparison=comparisonFor(detail.bill,rows,mappings);
        const groups=detail.groups.map(group=>{
          const groupKey=billingSkuKey(group);
          const mapping=mappings.find(row=>row.group_key===groupKey);
          return {...billingGroupRates(group),groupKey,mapping:mapping || null};
        });
        return {...detail,mappings,accountCoverage,accountComparison,requestInventory,modelOptions:catalog(),groups,modelSummary:providerBillingSummary(groups,rows),comparison,warnings:[...warnings,
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
