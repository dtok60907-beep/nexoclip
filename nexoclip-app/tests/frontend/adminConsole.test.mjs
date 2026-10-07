import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
const url = new URL('../../components/AdminConsole.js', import.meta.url);
const { code } = transformSync(await readFile(url, 'utf8'), { filename: url.pathname, configFile: false, babelrc: false, presets: [['@babel/preset-react', { runtime: 'automatic' }]], plugins: ['@babel/plugin-transform-modules-commonjs'] });
const module = { exports: {} }; const require = createRequire(url);
vm.runInNewContext(code, { require: name => ['./AdminNavigation','./AdminShell','./AccountMenu'].includes(name) ? () => null : require(name), module, exports: module.exports });
const Report=module.exports.ConsoleReport;
test('customer data is escaped and empty lists have an explicit state', () => {
 const html=renderToStaticMarkup(React.createElement(Report,{section:'customers',data:{items:[{id:'1',email:'<script>alert(1)</script>',role:'owner'}]}}));
 assert.doesNotMatch(html,/<script>/); assert.match(html,/&lt;script&gt;/); assert.match(html,/Lihat detail/);
 for (const section of ['customers','transactions','credits','jobs']) assert.match(renderToStaticMarkup(React.createElement(Report,{section,data:{items:[]}})),/Tidak ada data yang sesuai filter/);
});
test('overview explains sales basis and running warning rather than claiming net profit', () => {
 const html=renderToStaticMarkup(React.createElement(Report,{section:'overview',data:{summary:{members:1,balance:'0',sales_idr:'0',paid_topups:0,pending_topups:0,jobs:0,active:0,failed:0,long_running:0}}}));
 assert.match(html,/Penjualan top-up non-sandbox/); assert.match(html,/berbeda dari pendapatan kredit terpakai/); assert.match(html,/belum tentu macet/);
});
