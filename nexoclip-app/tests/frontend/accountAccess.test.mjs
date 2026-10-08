import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformSync} from '@babel/core';
const url=new URL('../../components/AccountAccessPanel.js',import.meta.url),require=createRequire(url),module={exports:{}};
const {code}=transformSync(await readFile(url,'utf8'),{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});
vm.runInNewContext(code,{require,module,exports:module.exports});
const render=(canManage,suspended_at=null,busy=false)=>renderToStaticMarkup(React.createElement(module.exports.AccountAccessControls,{data:{canManage,account:{email:'<script>customer</script>',suspended_at,active_sessions:2}},busy,reason:'',action:suspended_at?'activate':'suspend'}));
test('access controls require an audit reason, describe global scope and do not expose protected account actions',()=>{
 const html=render(true);assert.match(html,/Status: Aktif/);assert.match(html,/2 sesi aktif/);assert.match(html,/seluruh workspace/);assert.match(html,/minLength="10"/);assert.match(html,/maxLength="500"/);assert.match(html,/&lt;script&gt;/);assert.match(html,/value="suspend"/);assert.doesNotMatch(html,/value="activate"/);
 const suspended=render(true,'2026-10-08T00:00:00Z');assert.match(suspended,/Disuspend/);assert.match(suspended,/value="activate"/);assert.doesNotMatch(suspended,/value="suspend"/);assert.match(suspended,/pengguna harus login kembali/);
 const protectedAccount=render(false);assert.match(protectedAccount,/akun operator dilindungi/);assert.doesNotMatch(protectedAccount,/<form/);
});
