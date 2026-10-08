import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
import { idr, margin, economicsPath } from '../../src/lib/economicsDisplay.js';

test('display distinguishes known zero from missing financial values', () => {
  assert.match(idr(0), /0/);
  assert.equal(idr(null), 'Belum diketahui');
  assert.equal(idr(undefined), 'Belum diketahui');
  assert.equal(margin(null), 'Belum lengkap');
  assert.equal(margin(0), '0%');
  assert.equal(economicsPath({ from: '2026-10-01', to: '2026-10-07', groupBy: 'model', page: 2 }), '/api/admin/economics?from=2026-10-01&to=2026-10-07&groupBy=model&page=2&pageSize=25');
});

async function reportComponent() {
  const url = new URL('../../components/EconomicsDashboard.js', import.meta.url);
  const source = await readFile(url, 'utf8');
  const { code } = transformSync(source, { filename: url.pathname, configFile: false, babelrc: false,
    presets: [['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] });
  const module = { exports: {} };
  const require = createRequire(url);
  // This test renders the report only; the header's client account control
  // needs a Next router and is verified in the authenticated browser flow.
  vm.runInNewContext(code, { require: name => ['./AccountMenu', './AdminNavigation','./AdminShell'].includes(name) ? () => null : require(name), module, exports: module.exports, console }, { filename: url.pathname });
  return module.exports.EconomicsReport;
}

test('incomplete costs show missing coverage instead of a fabricated profit', async () => {
  const Report = await reportComponent();
  const totals = {
    recognizedRevenueIdr: 10000, providerCostIdr: 2000, paymentFeeIdr: null, knownPaymentFeeIdr: 0,
    contributionIdr: null, marginPercent: null, jobCount: 2, failedJobCount: 1, creditsConsumed: 50,
    providerRequestCount: 2, excludedSandboxJobs: 1, costSources: { reported: 1, calculated: 0 },
    coverage: { complete: false, revenueComplete: true, paymentFeesComplete: false, unknownPaymentFeeCredits: 50, unknownProviderRequests: 1 },
  };
  const html = renderToStaticMarkup(React.createElement(Report, { data: { totals, breakdown: [], items: [], pagination: { page: 1, totalPages: 1 } } }));
  assert.match(html, /Data biaya atau pendapatan belum lengkap/);
  assert.match(html, /Biaya pembayaran belum direkonsiliasi/);
  assert.match(html, /1 request belum diketahui biayanya/);
  assert.match(html, /Margin kontribusi: Belum lengkap/);
  assert.doesNotMatch(html, /80%/);
});

test('simulated trial revenue is labeled and partial contribution does not claim a complete margin',async()=>{
 const Report=await reportComponent();
 const totals={recognizedRevenueIdr:0,providerCostIdr:805.58819,paymentFeeIdr:0,knownPaymentFeeIdr:0,contributionIdr:null,marginPercent:null,jobCount:2,failedJobCount:1,creditsConsumed:7.2,providerRequestCount:2,excludedSandboxJobs:0,costSources:{reported:0,calculated:1},coverage:{complete:false,revenueComplete:true,paymentFeesComplete:true,unknownProviderRequests:1},simulation:{revenueIdr:1430.4,knownContributionIdr:624.81181,contributionIdr:null}};
 const html=renderToStaticMarkup(React.createElement(Report,{data:{totals,breakdown:[],items:[],pagination:{page:1,totalPages:1}}}));
 assert.match(html,/Pendapatan simulasi kredit terpakai/);assert.match(html,/Kontribusi simulasi sementara/);assert.match(html,/Pendapatan aktual tetap Rp.*0/);assert.match(html,/bukan pembayaran nyata/);assert.match(html,/Margin belum lengkap/);assert.match(html,/625/);
});

test('complete financial numbers still label unmatched contribution as temporary and show all proof categories',async()=>{
 const Report=await reportComponent();
 const {mapEconomicsTotals}=await import('../../src/services/economicsService.js');
 const totals=mapEconomicsTotals({job_count:1,provider_request_count:2,recognized_revenue_idr:1000,provider_cost_idr:400,estimated_request_count:1,estimated_cost_idr:150,provider_reported_request_count:1,provider_reported_cost_idr:250});
 const row={...totals,id:'job',key:'model',model:'model',status:'succeeded',cohortAt:'2026-10-07T00:00:00Z'};
 const html=renderToStaticMarkup(React.createElement(Report,{data:{totals,breakdown:[row],items:[row],pagination:{page:1,totalPages:1}}}));
 for(const phrase of ['Data perhitungan tersedia','Kontribusi sementara setelah provider dan pembayaran','Estimasi dari usage','Dilaporkan provider','Dicocokkan per request','Alokasi paket berbukti','Belum dicocokkan dengan bukti','belum berarti invoice bulanan sudah final'])assert.ok(html.includes(phrase),phrase);
 assert.doesNotMatch(html,/Data provider dan kredit sudah lengkap/);
 assert.match(html,/0 \/ 2 request/);
});

test('cost filter query and report scope explain whole-job totals consistently',async()=>{
 assert.ok(economicsPath({from:'2026-10-01',to:'2026-10-07',groupBy:'model',costStatus:'needs_reconciliation',page:2}).includes('costStatus=needs_reconciliation'));
 const Report=await reportComponent();const {mapEconomicsTotals}=await import('../../src/services/economicsService.js');
 const totals=mapEconomicsTotals({job_count:1,provider_request_count:1,estimated_request_count:1});
 const html=renderToStaticMarkup(React.createElement(Report,{data:{costStatus:'needs_reconciliation',totals,breakdown:[],items:[],pagination:{page:1,totalPages:1}}}));
 assert.match(html,/Lingkup laporan: Perlu pencocokan bukti/);assert.match(html,/seluruh biaya job yang dipilih tetap dihitung/);
});

test('a job row links to billing with the server report workspace, including non-BytePlus final providers',async()=>{
 const Report=await reportComponent();const {mapEconomicsTotals}=await import('../../src/services/economicsService.js');
 const workspaceId='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
 const totals=mapEconomicsTotals({job_count:1});
 const data={workspaceId,totals,breakdown:[],items:[{...totals,id,model:'fallback-model',provider:'other',status:'failed',cohortAt:'2026-10-07T00:00:00Z'}],pagination:{page:1,totalPages:1}};
 const html=renderToStaticMarkup(React.createElement(Report,{data}));
 assert.ok(html.includes(`/admin/provider-billing?workspaceId=${workspaceId}&amp;jobId=${id}`));
 assert.match(html,/Lihat request di Billing provider/);
 const oldResponse=renderToStaticMarkup(React.createElement(Report,{data:{...data,workspaceId:undefined}}));
 assert.doesNotMatch(oldResponse,/Lihat request di Billing provider/);
});

test('attention panel separates full-report counts from current-page causes and escapes job text',async()=>{
 const Report=await reportComponent();const {mapEconomicsTotals}=await import('../../src/services/economicsService.js');const {mapEconomicsAttention}=await import('../../src/lib/economicsJobIssues.js');
 const workspaceId='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
 const totals=mapEconomicsTotals({job_count:10,provider_request_count:10,estimated_request_count:10,unknown_fee_credits:2});
 const row={...mapEconomicsTotals({job_count:1,provider_request_count:1,estimated_request_count:1,unknown_fee_credits:2}),id,model:'<script>model</script>',status:'succeeded',cohortAt:'2026-10-07T00:00:00Z'};
 const data={workspaceId,totals,attention:mapEconomicsAttention({total_jobs:10,attention_jobs:8,provider_evidence:8,unknown_fee:2}),items:[row],breakdown:[],pagination:{page:2,totalPages:10}};
 const html=renderToStaticMarkup(React.createElement(Report,{data}));
 assert.match(html,/8 dari 10 job perlu diperiksa/);assert.match(html,/1 job pada halaman ini perlu diperiksa/);assert.match(html,/Penyebab per job pada halaman 2/);assert.match(html,/satu job dapat memiliki beberapa penyebab/);
 assert.match(html,/&lt;script&gt;model&lt;\/script&gt;/);assert.match(html,/href="#economics-payment-fees"/);assert.match(html,/Periksa request dan bukti provider/);
 assert.match(html,/Biaya pembayaran customer belum lengkap/);
});

test('issue selection is represented in the request and explains intersection with cost status',async()=>{
 const path=economicsPath({from:'2026-10-01',to:'2026-10-07',groupBy:'model',costStatus:'reconciled',issue:'unknown_fee',page:2});
 const params=new URL(path,'http://localhost').searchParams;assert.equal(params.get('issue'),'unknown_fee');assert.equal(params.get('costStatus'),'reconciled');assert.equal(params.get('page'),'2');
 const Report=await reportComponent();const {mapEconomicsTotals}=await import('../../src/services/economicsService.js');const {mapEconomicsAttention}=await import('../../src/lib/economicsJobIssues.js');
 const html=renderToStaticMarkup(React.createElement(Report,{data:{issue:'unknown_fee',costStatus:'reconciled',totals:mapEconomicsTotals({}),attention:mapEconomicsAttention({}),items:[],breakdown:[],pagination:{page:1,totalPages:0}},onIssue:()=>{}}));
 assert.match(html,/Penyebab: Biaya pembayaran customer belum lengkap/);assert.match(html,/diterapkan bersamaan/);assert.match(html,/Reset penyebab/);
 const counts=renderToStaticMarkup(React.createElement(Report,{data:{issue:'all',totals:mapEconomicsTotals({}),attention:mapEconomicsAttention({unknown_fee:1,total_jobs:1,attention_jobs:1}),items:[],breakdown:[],pagination:{page:1,totalPages:1}},onIssue:()=>{}}));
 assert.match(counts,/Lihat job dengan penyebab ini/);
});


test('CSV export control explains all-page scope, cap and unhealthy-only behavior',async()=>{
 const url=new URL('../../components/EconomicsDashboard.js',import.meta.url);const source=await readFile(url,'utf8');const {code}=transformSync(source,{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});const module={exports:{}};const require=createRequire(url);vm.runInNewContext(code,{require:name=>name==='./AdminShell'?()=>null:require(name),module,exports:module.exports});
 const Control=module.exports.EconomicsIssuesExportControl;
 const html=renderToStaticMarkup(React.createElement(Control,{enabled:true,exporting:false}));
 assert.match(html,/Ekspor CSV job bermasalah/);assert.match(html,/Mencakup semua halaman/);assert.match(html,/maksimal 5.000 job/);assert.match(html,/hanya mengekspor job yang perlu diperiksa/);
 const loading=renderToStaticMarkup(React.createElement(Control,{enabled:true,exporting:true}));assert.match(loading,/disabled/);assert.match(loading,/Menyiapkan CSV/);
 const failed=renderToStaticMarkup(React.createElement(Control,{enabled:true,feedback:{error:true,text:'<script>error</script>'}}));assert.match(failed,/role="alert"/);assert.match(failed,/&lt;script&gt;/);
});
