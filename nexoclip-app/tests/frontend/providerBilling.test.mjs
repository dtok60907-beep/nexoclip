import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';

const url = new URL('../../components/ProviderBillingDashboard.js', import.meta.url);
const { code } = transformSync(await readFile(url, 'utf8'), {
  filename: url.pathname, configFile: false, babelrc: false,
  presets: [['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const module = { exports: {} };
const require = createRequire(url);
vm.runInNewContext(code, { require: name => name === './AdminShell' ? () => null : require(name), module, exports: module.exports });

function detail(overrides = {}) {
  return {
    bill: { id: 'test', reference: 'Invoice test', provider_account_id: 'account-test', billing_cycle: '2026-10', row_count: 2,
      period_start: '2026-09-30T16:00:00.000Z', period_end: '2026-10-01T16:00:00.000Z',
      gross_usd: 10, discount_usd: 0, coupon_usd: 0, truncated_usd: 0, pre_tax_usd: 10, tax_usd: 0, total_usd: 10, package_row_count: 1 },
    groups: [{ configuration: 'Seedream', billing_unit: 'image', usage_unit: 'image', usage: 1, package_usage: 1, rows: 2, total_usd: 10 }],
    comparison: { requests: 1, knownCostUsd: 0, unknownRequests: 1, differenceUsd: 10, hash: 'current', rows: [{ model: 'Seedream', requests: 1, known_cost_usd: null, unknown_requests: 1 }] },
    reviews: [], warnings: [], ...overrides,
  };
}

const renderDetail = data => renderToStaticMarkup(React.createElement(module.exports.ProviderBillingDetail, { data }));
test('payment form explains evidence-only scope and escapes bank reference and notes',()=>{
  const data={bill:{environment:'development'},paymentEvidence:[{id:'1',kind:'invoice_payment',reference:'<script>',note:'<img>',amount_usd:'1',amount_idr:'17000',effectiveFx:'17000',paid_at:'2026-10-08T00:00:00Z'}]};
  const html=renderToStaticMarkup(React.createElement(module.exports.ProviderPaymentEvidence,{data,disabled:false,onSave:()=>{}}));
  assert.match(html,/Simpan bukti pembayaran/);assert.match(html,/belum mengubah COGS/);
  assert.match(html,/17.000/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img&gt;/);
  assert.doesNotMatch(html,/<script>|<img>/);
});
test('development invoice is explicitly separated from production evidence',()=>{
  const data=detail();data.bill.environment='development';
  assert.match(renderDetail(data),/Tagihan pengembangan; bukan bukti biaya production/);
  data.bill.environment='production';
  assert.match(renderDetail(data),/Lingkungan billing: Production/);
  assert.doesNotMatch(renderDetail(data),/Tagihan pengembangan/);
});
test('request inventory distinguishes unknown IDs, calculated costs, account coverage and truncated data',()=>{
  const inventory={limit:100,truncated:true,rows:[{observation_id:'1',generation_job_id:'job-test',workspace_id:'workspace-test',model:'<script>',provider_request_id:null,dispatch_id:'dispatch-test',provider_account_id:null,account_match:'unknown',request_time:'2026-10-07T00:00:00Z',time_is_fallback:true,event_type:'failed',cost_usd:null,cost_source:'unknown'},{observation_id:'2',generation_job_id:'job-2',workspace_id:'workspace-2',model:'Test',provider_request_id:'req-test',provider_account_id:'123',account_match:'matching',request_time:'2026-10-07T00:00:00Z',event_type:'succeeded',cost_usd:'0',cost_source:'calculated'}]};
  const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingRequests,{inventory}));
  for(const text of ['100 request terbaru','Belum tersedia','Dispatch: dispatch-test','Akun belum diketahui','Akun cocok','Dihitung dari usage','Belum diketahui','Workspace: workspace-test'])assert.ok(html.includes(text));
  assert.match(html,/US\$ 0/);assert.match(html,/dispatch belum tersedia/);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('account coverage reports unidentified and other accounts without claiming request-level allocation',()=>{
  const html=renderDetail(detail({accountCoverage:{matching_account_requests:0,unidentified_account_requests:2,other_account_requests:3,missing_request_ids:0},accountComparison:{knownCostUsd:'0',unknownRequests:0,differenceUsd:'10'}}));
  assert.match(html,/Pencocokan akun billing/);assert.match(html,/Akun belum diketahui/);
  assert.match(html,/Request akun lain/);assert.match(html,/Alokasi biaya ke job memerlukan detail billing dengan request ID/);
  assert.match(html,/Selisih tagihan dengan akun cocok/);assert.match(html,/Belum diketahui/);
});
test('model summary separates unknown coverage and package costs from actual zero values',()=>{
  const summary={mappedSkuCount:1,totalSkuCount:2,unmappedSkuCount:1,mappedPreTaxUsd:'0',unmappedPreTaxUsd:'1',rows:[{model:'<model>',skuCount:1,billedPreTaxUsd:'0',requestCount:0,knownRequestCostUsd:null,differenceUsd:null,unknownRequests:0,hasPackageOrPlan:true,status:'no_app_requests'}]};
  const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingModelSummary,{summary}));
  assert.match(html,/Ringkasan billing per model/);assert.match(html,/Biaya belum dipetakan sebelum pajak/);
  assert.match(html,/US\$ 0/);assert.match(html,/Belum diketahui/);
  assert.match(html,/Tidak ada request aplikasi/);assert.match(html,/Biaya pembelian paket \/ plan belum termasuk/);
  assert.match(html,/&lt;model&gt;/);assert.doesNotMatch(html,/<model>/);
});
test('SKU mapping form has explicit scope, model selection and escaped audit notes',()=>{
  const data={groups:[{configuration:'Test SKU',billing_unit:'Piece',usage_unit:'Piece',groupKey:'a',mapping:null}],modelOptions:['byteplus-test'],mappings:[{id:'1',model:'byteplus-test',note:'<script>bad</script>',created_at:'2026-10-07T00:00:00Z'}]};
  const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingMappings,{data,disabled:false,onSave:()=>{}}));
  assert.match(html,/Pemetaan hanya berlaku untuk tagihan ini/);
  assert.match(html,/Simpan pemetaan/);
  assert.match(html,/byteplus-test/);
  assert.match(html,/Riwayat pemetaan/);
  assert.doesNotMatch(html,/<script>/);
});

test('SKU historical rates display tiny token prices and explain package cost limits', () => {
  const html=renderDetail(detail({groups:[{configuration:'Token model',billing_unit:'Million tokens',usage_unit:'Token',usage:'1000000',package_usage:'0',non_package_usage:'1000000',pre_tax_usd:'0.15',total_usd:'0.165',effective_rate_usd:'0.000000150000',rate_status:'payg_observed'}]}));
  assert.match(html,/0,00000015/);
  assert.match(html,/PAYG teramati/);
  assert.match(html,/Biaya pembelian paket belum termasuk/);
  assert.match(html,/belum menjadi tarif katalog atau COGS final/);
});

test('billing difference and package usage stay unallocated, and unknown request costs are not rendered as zero', () => {
  const html = renderDetail(detail());
  assert.match(html, /Selisih sebelum pajak/);
  assert.match(html, /Selisih belum dialokasikan ke job atau customer/);
  assert.match(html, /CSV ini belum dipetakan ke akun provider aplikasi dan ID request per job/);
  assert.match(html, /Usage paket dengan nilai nol juga memerlukan biaya pembelian paket/);
  assert.match(html, /Belum diketahui/);
  assert.match(html, /Belum ditinjau; alokasi job belum tersedia/);
  assert.match(html, /1 Okt 2026/);
  assert.match(html, /UTC\+8/);
  assert.match(html, /akhir tidak termasuk/);
});

test('review matches the current comparison hash and remains distinct from job reconciliation', () => {
  const current = renderDetail(detail({ reviews: [{ note: 'Checked', comparison_hash: 'current', created_at: '2026-10-07T00:00:00.000Z' }] }));
  assert.match(current, /Ditinjau; alokasi job belum tersedia/);
  assert.doesNotMatch(current, /Pembanding berubah; perlu tinjauan ulang/);
  const stale = renderDetail(detail({ reviews: [{ note: 'Previous check', comparison_hash: 'old', created_at: '2026-10-07T00:00:00.000Z' }] }));
  assert.match(stale, /Pembanding berubah; perlu tinjauan ulang/);
  assert.match(stale, /Pembanding versi sebelumnya/);
});

test('uploaded CSV text and operator notes are escaped in billing detail', () => {
  const html = renderDetail(detail({
    groups: [{ configuration: '<img src=x onerror=alert(1)>', billing_unit: 'image', usage_unit: 'image', usage: 1, package_usage: 0, rows: 1, total_usd: 10 }],
    reviews: [{ note: '<script>alert(1)</script>', comparison_hash: 'current', created_at: '2026-10-07T00:00:00.000Z' }],
    warnings: ['<script>bad()</script>'],
  }));
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('package allocation form states scope and escapes evidence',()=>{
 const data={bill:{environment:'development'},paymentEvidence:[{id:'1',kind:'package_purchase',reference:'<proof>',amount_usd:'1'}],groups:[{groupKey:'a',configuration:'<sku>',usage_unit:'Piece',package_usage:'1'}],packageAllocations:[{id:'1',payment_evidence_id:'1',group_key:'a',consumed_quota:'1',total_quota:'3',usage_unit:'Piece',allocated_usd:'0.33333333',allocated_idr:'0.333333',note:'<note>'}]};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderPackageAllocation,{data,onSave:()=>{}}));
 assert.match(html,/Simpan alokasi paket/);assert.match(html,/Biaya per job belum berubah/);assert.match(html,/&lt;proof&gt;/);assert.match(html,/&lt;note&gt;/);
});

test('request reconciliation form explains permanent cost update and escapes charge evidence',()=>{
 const data={bill:{environment:'development'},paymentEvidence:[],groups:[],requestInventory:{rows:[],truncated:true},requestReconciliations:[{id:'1',provider_request_id:'<req>',generation_job_id:'job',cost_usd:'0.4',cost_idr:'6800',evidence_reference:'<proof>',note:'<note>'}]};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderRequestReconciliation,{data,onSave:()=>{}}));
 assert.match(html,/Simpan pencocokan biaya job/);assert.match(html,/memperbarui biaya job di Economics/);assert.match(html,/100 request terbaru/);assert.match(html,/&lt;proof&gt;/);assert.match(html,/&lt;req&gt;/);
});


test('correction form shows initial and effective values plus escaped audit evidence',()=>{
 const data={paymentEvidence:[{id:'1',kind:'invoice_payment',reference:'BANK',effectiveFx:'17000'}],groups:[{groupKey:'a',package_usage:'0',configuration:'Model',mapping:{model:'test'}}],requestReconciliations:[{id:'1',current_cost_event_id:'2',payment_evidence_id:'1',group_key:'a',provider_request_id:'<request>',generation_job_id:'job',original_cost_usd:'0.4',original_evidence_reference:'<initial>',original_note:'<old>',cost_usd:'0.6'}],requestCorrectionHistory:[{id:'1',provider_request_id:'<request>',previous_cost_usd:'0.4',cost_usd:'0.6',previous_cost_idr:'6800',cost_idr:'10200',evidence_reference:'<proof>',note:'<reason>',created_by:'operator',created_at:'2026-10-08T00:00:00Z'}]};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderRequestCostCorrections,{data,onSave:()=>{}}));
 assert.match(html,/Simpan koreksi biaya/);assert.match(html,/versi biaya/);assert.match(html,/nilai sebelumnya tetap tersimpan/);assert.match(html,/&lt;initial&gt;/);assert.match(html,/&lt;reason&gt;/);assert.match(html,/operator/);assert.match(html,/6.800/);assert.match(html,/10.200/);
});


test('request search and pagination display total coverage without old 100-row limit',()=>{
 const inventory={rows:[],limit:50,truncated:false,search:'<req>',pagination:{page:2,total:111,totalPages:3}};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingRequests,{inventory,onPage:()=>{},onSearch:()=>{}}));
 assert.match(html,/Cari request/);assert.match(html,/Request sebelumnya/);assert.match(html,/Request berikutnya/);assert.match(html,/Halaman 2 \/ 3/);assert.match(html,/111 request/);assert.match(html,/&lt;req&gt;/);assert.match(html,/Ringkasan biaya tetap mencakup seluruh periode/);assert.doesNotMatch(html,/100 request terbaru/);
});


test('audit CSV button explains full-invoice scope independently of request filters',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingDetail,{data:detail(),onExport:()=>{},disabled:false}));
 assert.match(html,/Ekspor CSV audit/);assert.match(html,/Ekspor tidak mengikuti filter request/);assert.match(html,/nilai awal dan terkini/);
});


test('status filter distinguishes corrected zero costs and displays search coverage',()=>{
 const inventory={rows:[{observation_id:'1',provider_request_id:'req',generation_job_id:'job',workspace_id:'workspace',model:'test',cost_usd:'0.00000000',cost_source:'reported',reconciliation_status:'corrected',account_match:'matching'}],status:'corrected',statusCounts:{unreconciled:110,reconciled:0,corrected:1},search:'',pagination:{page:1,total:1,totalPages:1}};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingRequests,{inventory,onPage:()=>{},onSearch:()=>{}}));
 assert.match(html,/Status rekonsiliasi/);assert.match(html,/Belum dicocokkan/);assert.match(html,/Dicocokkan tanpa koreksi/);assert.match(html,/<option value="corrected" selected="">Dikoreksi/);assert.match(html,/dikoreksi 1/);assert.match(html,/belum dicocokkan 110/);assert.match(html,/termasuk biaya nol/);assert.match(html,/Reset filter/);
});


test('request prerequisite column shows multiple blockers and escapes their text',()=>{
 const inventory={rows:[{observation_id:'1',provider_request_id:'req',model:'test',cost_source:'unknown',reconciliation_status:'unreconciled',readiness:{canReconcile:false,reasons:[{code:'missing_account',message:'Akun provider belum diketahui'},{code:'missing_mapping',message:'<unsafe> model mapping'}]}}]};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingRequests,{inventory}));
 assert.match(html,/Prasyarat pencocokan/);assert.match(html,/Akun provider belum diketahui/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/Prasyarat tersedia/);
 inventory.rows[0].readiness={canReconcile:true,reasons:[],eligibleGroupKeys:['sku']};
 const ready=renderToStaticMarkup(React.createElement(module.exports.ProviderBillingRequests,{inventory}));
 assert.match(ready,/Prasyarat tersedia/);assert.match(ready,/biaya dan bukti masih harus diperiksa/);assert.match(ready,/CSV agregat saja belum cukup/);
});

test('reconciliation selector excludes blocked and already reconciled requests',()=>{
 const data={bill:{environment:'development'},paymentEvidence:[{id:'1',kind:'invoice_payment'}],groups:[],requestInventory:{rows:[{observation_id:'1',provider_request_id:'eligible-request',model:'test',readiness:{canReconcile:true,eligibleGroupKeys:['sku']}},{observation_id:'2',provider_request_id:'blocked-request',readiness:{canReconcile:false,reasons:[{code:'missing_account',message:'Missing account'}]}},{observation_id:'3',provider_request_id:'reconciled-request',readiness:{canReconcile:false,reasons:[{code:'use_correction',message:'Use correction'}]}}]}};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderRequestReconciliation,{data,onSave:()=>{}}));
 assert.match(html,/eligible-request/);assert.doesNotMatch(html,/blocked-request/);assert.doesNotMatch(html,/reconciled-request/);
});

test('package job allocation form states cost basis, limits and escapes provider evidence',()=>{
  const data={bill:{environment:'development'},requestInventory:{rows:[]},requestReconciliations:[{id:'1',package_allocation_id:'2',provider_request_id:'<script>',generation_job_id:'job',package_consumed_quota:'1',cost_usd:'1',cost_idr:'17000',evidence_reference:'<img>',note:'Verified package usage'}]};
  const html=renderToStaticMarkup(React.createElement(module.exports.ProviderPackageRequestAllocation,{data,disabled:false,onSave:()=>{}}));
  assert.match(html,/Alokasi biaya paket ke job/);assert.match(html,/Sisa usage tetap belum dialokasikan/);assert.match(html,/Perubahan usage menggunakan form koreksi/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<script>|<img>/);
});

test('package correction shows original/current quota and escaped immutable history',()=>{
 const row={id:'1',package_allocation_id:'2',provider_request_id:'<script>',current_cost_event_id:'4',package_consumed_quota:'0',original_package_consumed_quota:'1',cost_usd:'0',cost_idr:'0',original_cost_usd:'1',original_cost_idr:'17000'};
 const history={id:'5',package_allocation_id:'2',provider_request_id:'<img>',previous_package_consumed_quota:'1',package_consumed_quota:'0',previous_cost_usd:'1',cost_usd:'0',previous_cost_idr:'17000',cost_idr:'0',evidence_reference:'<script>',note:'Verified cancel',created_by:'operator',created_at:'2026-10-08T00:00:00Z'};
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderPackageRequestCorrections,{data:{requestReconciliations:[row],requestCorrectionHistory:[history]},disabled:false,onSave:()=>{}}));
 assert.match(html,/Simpan koreksi usage paket/);assert.match(html,/Usage 0 membatalkan/);assert.match(html,/Usage awal 1/);assert.match(html,/operator/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<script>|<img>/);
});

test('job context presents evidence-based invoice choices and explains full-invoice summary scope',()=>{
 const scope={workspaceId:'workspace',jobId:'job'};
 const render=context=>renderToStaticMarkup(React.createElement(module.exports.ProviderBillingJobContext,{scope,context}));
 const empty=render({invoices:[]});
 assert.match(empty,/Belum ada tagihan yang cocok/);assert.match(empty,/waktu dispatch/);assert.match(empty,/ekspor tetap mencakup seluruh tagihan/);
 const choices=render({invoices:[{id:'one',reference:'Invoice A',billing_cycle:'2026-10',provider_account_id:'123'},{id:'two',reference:'Invoice B',billing_cycle:'2026-11',provider_account_id:'456'}]});
 assert.match(choices,/Buka Invoice A/);assert.match(choices,/Buka Invoice B/);assert.match(choices,/Tampilkan semua job/);
});

test('request guidance selects the package form, escapes blockers and distinguishes corrections',()=>{
 const render=request=>renderToStaticMarkup(React.createElement(module.exports.ProviderRequestGuidance,{request}));
 const packageReady=render({packageReadiness:{canReconcile:true,reasons:[]},readiness:{canReconcile:false,reasons:[{code:'package_unsupported',message:'Direct route blocked'}]}});
 assert.match(packageReady,/href="#provider-package-request"/);assert.match(packageReady,/paket, SKU, satuan, dan kuota/);assert.doesNotMatch(packageReady,/Direct route blocked/);
 const blocked=render({readiness:{canReconcile:false,reasons:[{code:'missing_mapping',message:'<script>missing mapping</script>'}]}});
 assert.match(blocked,/&lt;script&gt;/);assert.match(blocked,/href="#provider-sku-mapping"/);assert.doesNotMatch(blocked,/Buka form pencocokan/);
 const recorded=render({reconciliation_status:'corrected',readiness:{canReconcile:true}});
 assert.match(recorded,/bukti baru dan alasan koreksi/);assert.match(recorded,/href="#provider-package-corrections"/);assert.doesNotMatch(recorded,/Buka form pencocokan/);
});

test('guide explains the sequence and its anchor actions point to the actual panels',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.ProviderReconciliationGuide));
 for(const text of ['Langkah melengkapi biaya job','Jangan membagi total invoice secara perkiraan','Job gagal juga perlu bukti biaya provider','belum menyatakan COGS atau margin sudah final'])assert.ok(html.includes(text),text);
 const data={...detail(),bill:{...detail().bill,environment:'development'},modelOptions:[],mappings:[],paymentEvidence:[],packageAllocations:[],requestReconciliations:[],requestCorrectionHistory:[],requestInventory:{rows:[]}};
 for(const [name,target] of [['ProviderBillingMappings','provider-sku-mapping'],['ProviderPaymentEvidence','provider-payment-evidence'],['ProviderPackageAllocation','provider-package-allocation'],['ProviderPackageRequestAllocation','provider-package-request'],['ProviderPackageRequestCorrections','provider-package-corrections'],['ProviderRequestReconciliation','provider-request-reconciliation'],['ProviderRequestCostCorrections','provider-cost-corrections']]) {
  const panel=renderToStaticMarkup(React.createElement(module.exports[name],{data}));assert.ok(panel.includes(`id="${target}"`),name);
 }
});
