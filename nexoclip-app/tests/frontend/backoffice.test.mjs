import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
const url=new URL('../../components/BackofficeDashboard.js',import.meta.url);
const {code}=transformSync(await readFile(url,'utf8'),{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});
const module={exports:{}},require=createRequire(url);
vm.runInNewContext(code,{require:name=>name==='./AdminShell'?()=>null:require(name),module,exports:module.exports});
test('customer profile distinguishes shared workspace money, account activity, and unknown economics',()=>{
 const data={workspace:{name:'Business',balance:'750.000000',reserved:'6.300000'},account:{email:'<script>bad</script>',role:'member',created_at:'2026-10-01'},sessions:[],jobs:[],payments:[],ledger:[],lots:[],audit:[],economics:{since:'2026-09-08',until:'2026-10-08',totals:{recognizedRevenueIdr:0,providerCostIdr:806,contributionIdr:null,coverage:{complete:false}}}};
 const html=renderToStaticMarkup(React.createElement(module.exports.CustomerProfile,{data}));
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/750 kredit/);assert.match(html,/6,3 kredit/);assert.match(html,/workspace bersama/);assert.match(html,/Belum diketahui/);assert.match(html,/belum rekonsiliasi invoice BytePlus/);assert.match(html,/mulai fitur ini diaktifkan/);
});
