import test from 'node:test';
import assert from 'node:assert/strict';
import { metaConfig,metaLoginUrl,metaGet,metaCollection,exchangeMetaCode } from '../providers/meta/adapter.mjs';
import { encryptMetaToken,decryptMetaToken } from './metaCrypto.mjs';
import { completeMetaConnection,readMetaAdInsights } from './metaService.mjs';
import { consumeMetaOAuthState,disconnectMetaConnection,listMetaConnections } from '../repositories/metaRepository.mjs';
import { POST as start } from '../../app/api/meta/oauth/start/route.js';
import { GET as accounts } from '../../app/api/meta/accounts/route.js';
import { GET as insights } from '../../app/api/meta/ads/insights/route.js';
import { GET as callback } from '../../app/auth/meta/callback/route.js';

const id='11111111-1111-4111-8111-111111111111';
const env={META_APP_ID:'123',META_LOGIN_CONFIG_ID:'456',META_APP_SECRET:'test-app-secret',META_REDIRECT_URI:'https://local.example.test/auth/meta/callback',META_GRAPH_VERSION:'v27.0',META_TOKEN_ENCRYPTION_KEY:'b'.repeat(64)};
const json=data=>new Response(JSON.stringify(data));
function onboarding({invalidApp=false,scope=['instagram_basic','ads_read'],pages=false}={}){
  const calls=[];
  const fetcher=async(value,options)=>{
    const url=new URL(value);calls.push({url,options});
    if(url.pathname.endsWith('/oauth/access_token'))return json({access_token:'private-token'});
    if(url.pathname.endsWith('/debug_token'))return json({data:{is_valid:true,app_id:invalidApp?'other':'123',scopes:scope,expires_at:0}});
    if(url.pathname.endsWith('/me'))return json({id:'999',client_business_id:'888'});
    if(url.pathname.endsWith('/assigned_instagram_accounts'))return json({data:[{id:pages&&url.searchParams.has('after')?'778':'777',username:'test_creator'}],...(pages&&!url.searchParams.has('after')?{paging:{next:'https://evil.example/collect?access_token=private-token',cursors:{after:'next-page'}}}:{})});
    if(url.pathname.endsWith('/adaccounts'))return json({data:[{id:'act_666',name:'Test ads',currency:'IDR',timezone_name:'Asia/Jakarta',account_status:1}]});
    assert.fail(`Unexpected API path ${url.pathname}`);
  };
  return {calls,fetcher};
}
test('Unified Login uses Meta App/config IDs, fresh state and an exact HTTPS callback',()=>{
  const url=new URL(metaLoginUrl(metaConfig(env),'csrf-state'));
  assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.searchParams.get('config_id'),'456');assert.equal(url.searchParams.get('client_id'),'123');
  assert.equal(url.searchParams.get('state'),'csrf-state');assert.equal(url.searchParams.get('prompt'),'login');assert.equal(url.href.includes(env.META_APP_SECRET),false);
  for(const uri of ['http://localhost/auth/meta/callback','https://local.example.test/other','https://local.example.test/auth/meta/callback?redirect=evil'])assert.throws(()=>metaConfig({...env,META_REDIRECT_URI:uri}));
});
test('Meta token envelope uses a separate key and detects tampering',()=>{
  const value=encryptMetaToken('private-token',env);assert.notEqual(value,'private-token');assert.equal(decryptMetaToken(value,env),'private-token');
  assert.throws(()=>decryptMetaToken(value,{...env,META_TOKEN_ENCRYPTION_KEY:'a'.repeat(64)}));
});
test('code exchange validates app ownership and collects all Instagram/ad assets without following next URLs',async()=>{
  const {fetcher,calls}=onboarding({pages:true});const result=await exchangeMetaCode('code',env,fetcher);
  assert.equal(result.clientBusinessId,'888');assert.equal(result.instagram.length,2);assert.equal(result.adAccounts[0].id,'act_666');
  assert.ok(calls.every(c=>c.url.hostname==='graph.facebook.com'));
  const exchange=calls[0].url;assert.equal(exchange.searchParams.get('redirect_uri'),env.META_REDIRECT_URI);
  assert.ok(calls.slice(2).every(c=>c.options.headers.authorization==='Bearer private-token'));
  await assert.rejects(exchangeMetaCode('code',env,onboarding({invalidApp:true}).fetcher),e=>e.code==='META_TOKEN_INVALID');
});
test('missing ads consent skips Marketing API and incomplete pagination is rejected',async()=>{
  const fixture=onboarding({scope:['instagram_basic']});const result=await exchangeMetaCode('code',env,fixture.fetcher);
  assert.equal(result.adAccounts.length,0);assert.equal(fixture.calls.some(c=>c.url.pathname.endsWith('/adaccounts')),false);
  await assert.rejects(metaCollection('/me/adaccounts','private',{},env,async()=>json({data:[],paging:{next:'https://evil'}})),e=>e.code==='META_PAGINATION_INVALID');
});
test('Meta errors do not expose provider messages or token URLs and rate limits are distinguished',async()=>{
  await assert.rejects(metaGet('/me','private',{},env,async()=>json({error:{code:190,message:'token private https://secret.example'}})),e=>e.code==='META_RECONNECT_REQUIRED'&&!e.message.includes('private'));
  await assert.rejects(metaGet('/me','private',{},env,async()=>json({error:{code:613}})),e=>e.status===429);
  await assert.rejects(metaGet('/me','private',{},env,async()=>{throw new Error('https://secret.example/token');}),e=>e.code==='META_NETWORK_ERROR'&&!e.message.includes('secret'));
});
test('connection persistence encrypts tokens and stores assets in one transaction',async()=>{
  const calls=[],query=async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('RETURNING id')?[{id}]:[],rowCount:1};};
  await completeMetaConnection({connect:async()=>({query,release(){}})},{workspaceId:id,userId:id,code:'code'},env,onboarding().fetcher);
  const insert=calls.find(c=>c.sql.includes('INSERT INTO meta_integrations'));
  assert.equal(decryptMetaToken(insert.args[6],env),'private-token');assert.equal(insert.args.includes('private-token'),false);
  assert.equal(calls.at(-1).sql,'COMMIT');assert.ok(calls.some(c=>c.sql.includes('INSERT INTO social_accounts')));assert.ok(calls.some(c=>c.sql.includes('INSERT INTO meta_ad_accounts')));
});
test('OAuth states are one-use and tied to both session and owner',async()=>{
  let query;
  await consumeMetaOAuthState({query:async(sql,args)=>{query={sql,args};return {rows:[]};}},{stateHash:'hashed',sessionHash:Buffer.from('session')});
  assert.match(query.sql,/DELETE FROM meta_oauth_states/);assert.match(query.sql,/s.session_token_hash=\$2/);assert.match(query.sql,/se.user_id=s.user_id/);assert.match(query.sql,/s.expires_at>now\(\)/);
});
test('insights ownership, scope, expiry and app checks precede provider access',async()=>{
  const row={provider_account_id:'act_666',integration_id:id,app_id:'123',granted_scopes:['ads_read'],status:'connected',access_token_encrypted:encryptMetaToken('private',env),currency:'IDR',timezone_name:'Asia/Jakarta'};
  const input={workspaceId:id,userId:id,accountId:id,period:'last_7d'};
  let args;const pool={query:async(sql,values)=>{args=values;return {rows:[row]};}};
  const report=await readMetaAdInsights(pool,input,env,async(url)=>{assert.equal(new URL(url).pathname,'/v27.0/act_666/insights');return json({data:[{account_id:'666',spend:'12.34',account_currency:'IDR',access_token:'secret',impressions:'50'}]});});
  assert.deepEqual(args,[id,id,id]);assert.equal(report.rows[0].spend,'12.34');assert.equal('access_token' in report.rows[0],false);
  for(const override of [{status:'disconnected'},{granted_scopes:[]},{access_expires_at:new Date(0)},{app_id:'other'}])await assert.rejects(readMetaAdInsights({query:async()=>({rows:[{...row,...override}]})},input,env,()=>assert.fail('No provider call')));
  await assert.rejects(readMetaAdInsights({query:async()=>({rows:[]})},input,env,()=>assert.fail('No cross-tenant API call')),e=>e.status===404);
  await assert.rejects(readMetaAdInsights(pool,input,env,async()=>json({data:[{account_id:'other'}]})),e=>e.code==='META_INSIGHTS_INVALID');
});
test('disconnect clears this workspace credential without a global Meta revocation',async()=>{
  const queries=[];const query=async(sql,args)=>{queries.push({sql,args});return {rowCount:1};};
  await disconnectMetaConnection({connect:async()=>({query,release(){}})},{workspaceId:id,userId:id,integrationId:id});
  assert.match(queries[1].sql,/access_token_encrypted=''/);assert.match(queries[1].sql,/workspace_id=\$2 AND user_id=\$3/);
});
test('account responses select no encrypted tokens',async()=>{
  const queries=[];await listMetaConnections({query:async(sql)=>{queries.push(sql);return {rows:[]};}},{workspaceId:id,userId:id});
  assert.ok(queries.every(sql=>!sql.includes('access_token_encrypted')));
});
test('HTTP routes require a session and protect OAuth start against CSRF',async()=>{
  const request=(method,origin)=>Object.assign(new Request('http://localhost/api/meta/accounts',{method,headers:origin?{origin}:{}}),{cookies:{get:()=>undefined}});
  assert.equal((await start(request('POST'))).status,403);assert.equal((await start(request('POST','http://localhost'))).status,401);
  assert.equal((await accounts(request('GET'))).status,401);assert.equal((await insights(request('GET'))).status,401);
  const response=await callback(request('GET'));assert.equal(response.status,307);assert.match(response.headers.get('location'),/meta=state_invalid/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});
