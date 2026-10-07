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
