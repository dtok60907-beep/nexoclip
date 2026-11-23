import { createHmac } from 'node:crypto';

const messages={
  META_PROFESSIONAL_REQUIRED:'Instagram requires a Creator or Business account. Change the account type in Instagram, then reconnect.',
  META_RECONNECT_REQUIRED:'Reconnect your Meta account to continue.',
  META_ADS_PERMISSION_REQUIRED:'Reconnect Meta and allow access to ad reports.',
  META_CAMPAIGN_PARTIAL:'Campaign created paused, but its ad set was not. Open Ads Manager and finish setup there.',
  META_AD_SETUP_REQUIRED:'Set up at least one ad before running this campaign.',
  META_CAMPAIGN_MUST_BE_PAUSED:'Pause the campaign before changing its ad setup.',
  META_CAMPAIGN_NOT_FOUND:'Campaign not found in the selected ad account.',
  META_PUBLIC_STORAGE_REQUIRED:'Video ad thumbnails require R2 or another HTTPS accessible storage provider.',
  META_ASSET_READ_FAILED:'Could not read the selected media from workspace storage.',
  META_ACCOUNT_NOT_FOUND:'Connected ad account not found.',
  META_RATE_LIMITED:'Meta is limiting requests. Wait a little before refreshing.',
  META_PERMISSION_REQUIRED:'Meta has not granted the permission required for this request.',
  META_PERIOD_INVALID:'Choose a supported reporting period.',
  META_ACCOUNT_INVALID:'Choose a connected ad account.',
  META_APP_CHANGED_RECONNECT:'Meta app configuration changed. Reconnect your account.',
};
export const metaError = (code,status=502) => Object.assign(new Error(messages[code]||'Meta connection is unavailable. Check the connection and try again.'),{code,status});
export function metaConfig(env=process.env) {
  const {META_APP_ID:appId,META_APP_SECRET:appSecret,META_LOGIN_CONFIG_ID:configId,META_REDIRECT_URI:redirectUri}=env;
  if(!/^\d+$/.test(appId||'')||!/^\d+$/.test(configId||'')||!appSecret||! /^[a-f\d]{64}$/i.test(env.META_TOKEN_ENCRYPTION_KEY||''))throw metaError('META_NOT_CONFIGURED',503);
  let url;try{url=new URL(redirectUri);}catch{throw metaError('META_REDIRECT_NOT_CONFIGURED',503);}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/auth/meta/callback')throw metaError('META_REDIRECT_INVALID',503);
  const version=env.META_GRAPH_VERSION||'v27.0';
  if(!/^v\d+\.\d+$/.test(version))throw metaError('META_VERSION_INVALID',503);
  return {appId,appSecret,configId,redirectUri:url.href,version};
}

export function metaLoginUrl(config,state) {
  const url=new URL('https://www.facebook.com/dialog/oauth');
  url.search=new URLSearchParams({client_id:config.appId,config_id:config.configId,redirect_uri:config.redirectUri,response_type:'code',override_default_response_type:'true',prompt:'login',state}).toString();
  return url.href;
}

export const metaGet=(path,token,params={},env=process.env,fetcher=fetch)=>metaRequest('GET',path,token,params,env,fetcher);
export const metaPost=(path,token,params={},env=process.env,fetcher=fetch)=>metaRequest('POST',path,token,params,env,fetcher);
export const metaVideoPost=(path,token,params={},env=process.env,fetcher=fetch)=>metaRequest('POST',path,token,params,env,fetcher,'graph-video.facebook.com');
export async function metaUpload(path,token,{field,filename,contentType,body},env=process.env,fetcher=fetch) {
  const version=env.META_GRAPH_VERSION||'v27.0';
  if(!/^v\d+\.\d+$/.test(version)||!/^\/[A-Za-z0-9_/-]+$/.test(path)||!['source','bytes'].includes(field)||!Buffer.isBuffer(body))throw metaError('META_REQUEST_INVALID',400);
  const url=new URL(`https://${field==='source'?'graph-video.facebook.com':'graph.facebook.com'}/${version}${path}`);
  const form=new FormData();form.set(field,new Blob([body],{type:contentType}),filename);
  if(token&&env.META_APP_SECRET)form.set('appsecret_proof',createHmac('sha256',env.META_APP_SECRET).update(token).digest('hex'));
  let response,data;
  try{response=await fetcher(url.href,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${token}`},body:form,signal:AbortSignal.timeout(60_000)});data=await response.json();}
  catch{throw metaError('META_NETWORK_ERROR');}
  if(!response.ok||data?.error){const code=Number(data?.error?.code),auth=code===190||response.status===401,limited=[4,17,32,613].includes(code)||response.status===429,permission=[10,200].includes(code);throw Object.assign(metaError(auth?'META_RECONNECT_REQUIRED':limited?'META_RATE_LIMITED':permission?'META_PERMISSION_REQUIRED':'META_API_ERROR',auth?409:limited?429:permission?403:502),{providerCode:Number.isFinite(code)?code:null,providerSubcode:Number(data?.error?.error_subcode)||null,providerMessage:typeof data?.error?.message==='string'?data.error.message.slice(0,400):null,providerHttpStatus:response.status});}
  if(!data||typeof data!=='object')throw metaError('META_INVALID_RESPONSE');return data;
}
async function metaRequest(method,path,token,params,env,fetcher,host='graph.facebook.com') {
  const version=env.META_GRAPH_VERSION||'v27.0';
  if(!/^v\d+\.\d+$/.test(version)||!/^\/[A-Za-z0-9_/-]+$/.test(path))throw metaError('META_REQUEST_INVALID',400);
  const url=new URL(`https://${host}/${version}${path}`);
  const search={...params};
  if(token&&env.META_APP_SECRET)search.appsecret_proof=createHmac('sha256',env.META_APP_SECRET).update(token).digest('hex');
  if(method==='GET')url.search=new URLSearchParams(search).toString();
  let response,data;
  try {
    response=await fetcher(url.href,{method,redirect:'error',headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(method==='POST'?{'content-type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:new URLSearchParams(search).toString()}:{}),signal:AbortSignal.timeout(20_000)});
    data=await response.json();
  }catch{throw metaError('META_NETWORK_ERROR');}
  if(!response.ok||data?.error){
    const code=Number(data?.error?.code),auth=code===190||response.status===401,limited=[4,17,32,613].includes(code)||response.status===429,permission=[10,200].includes(code);
    const personal=code===10&&/account type is not business or creator/i.test(data?.error?.message||'');
    const subcode=Number(data?.error?.error_subcode),message=data?.error?.message;
    throw Object.assign(metaError(personal?'META_PROFESSIONAL_REQUIRED':auth?'META_RECONNECT_REQUIRED':limited?'META_RATE_LIMITED':permission?'META_PERMISSION_REQUIRED':'META_API_ERROR',personal?409:auth?409:limited?429:permission?403:502),{providerCode:Number.isFinite(code)?code:null,providerSubcode:Number.isFinite(subcode)?subcode:null,providerMessage:typeof message==='string'?message.slice(0,400):null,providerHttpStatus:response.status});
  }
  if(!data||typeof data!=='object')throw metaError('META_INVALID_RESPONSE');
  return data;
}

export async function metaCollection(path,token,params,env,fetcher) {
  const rows=[],seen=new Set();let after;
  // shortcut: bound interactive onboarding to 20 pages; refuse partial snapshots for larger portfolios.
  for(let page=0;page<20;page++){
    const data=await metaGet(path,token,{...params,limit:'100',...(after?{after}:{})},env,fetcher);
    if(!Array.isArray(data.data))throw metaError('META_INVALID_RESPONSE');
    rows.push(...data.data);
    if(!data.paging?.next)return rows;
    after=data.paging.cursors?.after;
    if(typeof after!=='string'||!after||after.length>4096||seen.has(after))throw metaError('META_PAGINATION_INVALID');
    seen.add(after);
    // Never follow paging.next: it can contain credentials or an unexpected host.
  }
  throw metaError('META_PORTFOLIO_TOO_LARGE',409);
}

export async function exchangeMetaCode(code,env=process.env,fetcher=fetch) {
  const config=metaConfig(env),deadline=AbortSignal.timeout(45_000);
  const request=(url,options)=>fetcher(url,{...options,signal:AbortSignal.any([options.signal,deadline])});
  const token=await metaGet('/oauth/access_token',null,{client_id:config.appId,client_secret:config.appSecret,code,redirect_uri:config.redirectUri},env,request);
  if(typeof token.access_token!=='string'||!token.access_token)throw metaError('META_TOKEN_INVALID');
  const debug=await metaGet('/debug_token',`${config.appId}|${config.appSecret}`,{input_token:token.access_token},env,request);
  const info=debug.data;
  if(!info?.is_valid||String(info.app_id)!==config.appId||!Array.isArray(info.scopes)||!info.scopes.includes('instagram_basic'))throw metaError('META_TOKEN_INVALID',403);
  const profile=await metaGet('/me',token.access_token,{fields:'id,client_business_id'},env,request);
  if(typeof profile.id!=='string'||typeof profile.client_business_id!=='string'||!/^\d+$/.test(profile.id)||!/^\d+$/.test(profile.client_business_id))throw metaError('META_BUSINESS_TOKEN_REQUIRED',403);
  const instagram=await metaCollection('/me/assigned_instagram_accounts',token.access_token,{fields:'id,username'},env,request);
  const hasAds=info.scopes.includes('ads_read')||info.scopes.includes('ads_management');
  const adAccounts=hasAds?await metaCollection('/me/adaccounts',token.access_token,{fields:'id,name,currency,timezone_name,account_status'},env,request):[];
  if(instagram.some(a=>typeof a.id!=='string'||!/^\d+$/.test(a.id)||typeof a.username!=='string')||adAccounts.some(a=>typeof a.id!=='string'||!/^act_\d+$/.test(a.id)))throw metaError('META_INVALID_ASSETS');
  const expiry=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000):null;
  const accessExpiresAt=expiry(info.expires_at),dataAccessExpiresAt=expiry(info.data_access_expires_at);
  if([accessExpiresAt,dataAccessExpiresAt].some(date=>date&&date.getTime()<=Date.now()))throw metaError('META_TOKEN_EXPIRED',403);
  return {config,accessToken:token.access_token,scopes:info.scopes.filter(s=>typeof s==='string'),clientBusinessId:profile.client_business_id,systemUserId:profile.id,accessExpiresAt,dataAccessExpiresAt,instagram,adAccounts};
}
