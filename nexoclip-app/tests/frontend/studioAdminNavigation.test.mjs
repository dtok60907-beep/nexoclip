import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
const url=new URL('../../components/AdminNavigation.js',import.meta.url);
const {code}=transformSync(await readFile(url,'utf8'),{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});
const module={exports:{}},require=createRequire(url);
vm.runInNewContext(code,{require:name=>name==='next/link'?props=>React.createElement('a',props):require(name),module,exports:module.exports});
const Navigation=module.exports.default;
test('admin sidebar links cover every admin page with exactly one active destination',()=>{
 const html=renderToStaticMarkup(React.createElement(Navigation,{active:'/admin/economics'}));
 for(const [href] of module.exports.adminLinks)assert.match(html,new RegExp(`href="${href}"`));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.match(html,/href="\/admin\/economics"[^>]*aria-current="page"/);
 assert.doesNotMatch(html,/href="\/studio/);
});
test('studio sidebar contains no embedded admin section and account control provides a separate console entry',async()=>{
 const shell=await readFile(new URL('../../components/StandaloneShell.js',import.meta.url),'utf8');
 const account=await readFile(new URL('../../components/AccountMenu.js',import.meta.url),'utf8');
 assert.doesNotMatch(shell,/StudioAdminNavigation/);assert.match(shell,/<AccountMenu showAdminLink/);
 assert.match(account,/showAdminLink && user\?\.isPlatformOperator === true/);
});
