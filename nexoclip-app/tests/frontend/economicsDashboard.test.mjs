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
