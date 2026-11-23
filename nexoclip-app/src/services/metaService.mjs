import { metaGet,metaPost,metaUpload,metaConfig,metaError,exchangeMetaCode } from '../providers/meta/adapter.mjs';
import { encryptMetaToken,decryptMetaToken } from './metaCrypto.mjs';
import { persistMetaConnection,findMetaAdCredentials,markMetaReconnect } from '../repositories/metaRepository.mjs';
import { createStorage } from './assetService.js';

export async function completeMetaConnection(pool,{workspaceId,userId,code},env=process.env,fetcher=fetch) {
  const snapshot=await exchangeMetaCode(code,env,fetcher);
  return persistMetaConnection(pool,{workspaceId,userId,snapshot,encryptedToken:encryptMetaToken(snapshot.accessToken,env)});
}
export async function readMetaAdInsights(pool,input,env=process.env,fetcher=fetch) {
  if(!['last_7d','last_30d','this_month'].includes(input.period))throw metaError('META_PERIOD_INVALID',400);
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.accountId||''))throw metaError('META_ACCOUNT_INVALID',400);
  const account=await findMetaAdCredentials(pool,input);
  if(!account)throw metaError('META_ACCOUNT_NOT_FOUND',404);
  if(account.status!=='connected'||[account.access_expires_at,account.data_access_expires_at].some(d=>d&&new Date(d).getTime()<=Date.now()))throw metaError('META_RECONNECT_REQUIRED',409);
  if(!account.granted_scopes.some(s=>['ads_read','ads_management'].includes(s)))throw metaError('META_ADS_PERMISSION_REQUIRED',403);
  const config=metaConfig(env);
  if(account.app_id!==config.appId)throw metaError('META_APP_CHANGED_RECONNECT',409);
  try {
    const result=await metaGet(`/${account.provider_account_id}/insights`,decryptMetaToken(account.access_token_encrypted,env),
      {date_preset:input.period,level:'account',fields:'account_id,account_name,account_currency,date_start,date_stop,impressions,reach,clicks,spend,cpc,cpm,ctr',limit:'1'},env,fetcher);
    if(!Array.isArray(result.data)||result.data.length>1||result.data.some(r=>String(r.account_id)!==account.provider_account_id.slice(4)))throw metaError('META_INSIGHTS_INVALID');
    const fields=['account_id','account_name','account_currency','date_start','date_stop','impressions','reach','clicks','spend','cpc','cpm','ctr'];
    return {rows:result.data.map(row=>Object.fromEntries(fields.filter(k=>typeof row[k]==='string').map(k=>[k,row[k]]))),currency:account.currency,timeZone:account.timezone_name};
  }catch(error){if(error.code==='META_RECONNECT_REQUIRED')await markMetaReconnect(pool,account.integration_id);throw error;}
}

export async function readMetaCampaigns(pool,input,env=process.env,fetcher=fetch) {
  if(!['last_7d','last_30d','this_month'].includes(input.period))throw metaError('META_PERIOD_INVALID',400);
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.accountId||''))throw metaError('META_ACCOUNT_INVALID',400);
  const account=await (await import('../repositories/metaRepository.mjs')).findMetaCampaignCredentials(pool,input);
  if(!account)throw metaError('META_ACCOUNT_NOT_FOUND',404);
  if(account.status!=='connected'||[account.access_expires_at,account.data_access_expires_at].some(d=>d&&new Date(d).getTime()<=Date.now()))throw metaError('META_RECONNECT_REQUIRED',409);
  if(!account.granted_scopes.some(s=>['ads_read','ads_management'].includes(s)))throw metaError('META_ADS_PERMISSION_REQUIRED',403);
  const config=metaConfig(env);if(account.app_id!==config.appId)throw metaError('META_APP_CHANGED_RECONNECT',409);
  const token=decryptMetaToken(account.access_token_encrypted,env);
  try {
    const campaigns=await metaGet(`/${account.provider_account_id}/campaigns`,token,{fields:'id,name,objective,status,effective_status,created_time,updated_time,adsets.limit(20){id,name,status,effective_status,daily_budget,ads.limit(20){id,name,status,effective_status}}',limit:'50'},env,fetcher);
    if(!Array.isArray(campaigns.data)||campaigns.data.length>50||campaigns.data.some(c=>typeof c.id!=='string'||!/^\d+$/.test(c.id)||typeof c.name!=='string'))throw metaError('META_CAMPAIGNS_INVALID');
    const rows=await Promise.all(campaigns.data.map(async campaign=>{
      const result=await metaGet(`/${campaign.id}/insights`,token,{date_preset:input.period,fields:'campaign_id,impressions,reach,clicks,spend,cpc,cpm,ctr',limit:'1'},env,fetcher);
      if(!Array.isArray(result.data)||result.data.length>1||result.data.some(row=>row.campaign_id!==campaign.id))throw metaError('META_INSIGHTS_INVALID');
      const metrics=result.data[0]||{};
      return {id:campaign.id,name:campaign.name,objective:campaign.objective||null,status:campaign.status||null,effectiveStatus:campaign.effective_status||null,
        adSets:(campaign.adsets?.data||[]).map(set=>({id:set.id,name:set.name||'',status:set.status||null,effectiveStatus:set.effective_status||null,dailyBudgetMinor:Number(set.daily_budget)||null,ads:(set.ads?.data||[]).map(ad=>({id:ad.id,name:ad.name||'',status:ad.status||null,effectiveStatus:ad.effective_status||null}))})),
        metrics:Object.fromEntries(['impressions','reach','clicks','spend','cpc','cpm','ctr'].filter(k=>typeof metrics[k]==='string').map(k=>[k,metrics[k]]))};
    }));
    return {campaigns:rows,currency:account.currency,timeZone:account.timezone_name};
  }catch(error){if(error.code==='META_RECONNECT_REQUIRED')await markMetaReconnect(pool,account.integration_id);throw error;}
}

const campaignObjectives=new Set(['OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT']);
const specialCategories=new Set(['NONE','HOUSING','EMPLOYMENT','CREDIT','ISSUES_ELECTIONS_POLITICS']);
export function validateMetaCampaign(input) {
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.accountId||''))throw metaError('META_ACCOUNT_INVALID',400);
  if(typeof input.name!=='string'||input.name.trim().length<3||input.name.trim().length>100)throw Object.assign(new Error('Campaign name must be 3–100 characters'),{status:400});
  if(!campaignObjectives.has(input.objective))throw Object.assign(new Error('Choose a supported campaign objective'),{status:400});
  if(!specialCategories.has(input.specialCategory)||!Number.isSafeInteger(input.dailyBudgetMinor)||input.dailyBudgetMinor<100)throw Object.assign(new Error('Choose a special ad category and a daily budget of at least 100 in the ad account currency minor unit'),{status:400});
  const countries=Array.isArray(input.countries)?[...new Set(input.countries)]:[];
  if(!countries.length||countries.length>10||countries.some(c=>typeof c!=='string'||! /^[A-Z]{2}$/.test(c)))throw Object.assign(new Error('Choose 1–10 ISO country codes'),{status:400});
  if(input.confirm!==true)throw Object.assign(new Error('Confirm creating this paused campaign'),{status:400});
  return {name:input.name.trim(),objective:input.objective,specialCategory:input.specialCategory,countries,dailyBudgetMinor:input.dailyBudgetMinor};
}
export async function createMetaPausedCampaign(pool,input,env=process.env,fetcher=fetch) {
  const value=validateMetaCampaign(input),{findMetaCampaignCredentials}=await import('../repositories/metaRepository.mjs');
  const account=await findMetaCampaignCredentials(pool,input);
  if(!account)throw metaError('META_ACCOUNT_NOT_FOUND',404);
  if(account.status!=='connected'||[account.access_expires_at,account.data_access_expires_at].some(d=>d&&new Date(d).getTime()<=Date.now()))throw metaError('META_RECONNECT_REQUIRED',409);
  if(!account.granted_scopes.includes('ads_management'))throw metaError('META_ADS_PERMISSION_REQUIRED',403);
  const config=metaConfig(env);if(account.app_id!==config.appId)throw metaError('META_APP_CHANGED_RECONNECT',409);
  const token=decryptMetaToken(account.access_token_encrypted,env);
  const campaign=await metaPost(`/${account.provider_account_id}/campaigns`,token,{name:value.name,objective:value.objective,buying_type:'AUCTION',status:'PAUSED',special_ad_categories:JSON.stringify(value.specialCategory==='NONE'?[]:[value.specialCategory]),is_adset_budget_sharing_enabled:'false'},env,fetcher);
  if(typeof campaign.id!=='string'||!/^\d+$/.test(campaign.id))throw metaError('META_INVALID_RESPONSE');
  try {
    const adset=await metaPost(`/${account.provider_account_id}/adsets`,token,{name:`${value.name} · Ad set`,campaign_id:campaign.id,daily_budget:String(value.dailyBudgetMinor),billing_event:'IMPRESSIONS',optimization_goal:value.objective==='OUTCOME_ENGAGEMENT'?'POST_ENGAGEMENT':'LINK_CLICKS',targeting:JSON.stringify({geo_locations:{countries:value.countries},publisher_platforms:['instagram'],instagram_positions:['stream','story','reels']}),status:'PAUSED'},env,fetcher);
    if(typeof adset.id!=='string'||!/^\d+$/.test(adset.id))throw metaError('META_INVALID_RESPONSE');
    return {campaignId:campaign.id,adsetId:adset.id,status:'PAUSED',currency:account.currency,requiresCreative:true};
  }catch(error){throw Object.assign(metaError('META_CAMPAIGN_PARTIAL',409),{campaignId:campaign.id,causeCode:error.code||'META_API_ERROR',causeProviderCode:error.providerCode,causeProviderSubcode:error.providerSubcode,causeProviderMessage:error.providerMessage, causeProviderHttpStatus:error.providerHttpStatus});}
}

async function metaAdsContext(pool,input,env,fetcher) {
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.accountId||''))throw metaError('META_ACCOUNT_INVALID',400);
  const account=await (await import('../repositories/metaRepository.mjs')).findMetaCampaignCredentials(pool,input);
  if(!account)throw metaError('META_ACCOUNT_NOT_FOUND',404);
  if(account.status!=='connected'||[account.access_expires_at,account.data_access_expires_at].some(d=>d&&new Date(d).getTime()<=Date.now()))throw metaError('META_RECONNECT_REQUIRED',409);
  if(!account.granted_scopes.includes('ads_management'))throw metaError('META_ADS_PERMISSION_REQUIRED',403);
  const config=metaConfig(env);if(account.app_id!==config.appId)throw metaError('META_APP_CHANGED_RECONNECT',409);
  return {account,token:decryptMetaToken(account.access_token_encrypted,env)};
}

export async function readMetaAdOptions(pool,input,env=process.env,fetcher=fetch) {
  const {account,token}=await metaAdsContext(pool,input,env,fetcher),root=`/${account.provider_account_id}`;
  const [pages,instagram]=await Promise.all([
    metaGet(`${root}/promote_pages`,token,{fields:'id,name',limit:'100'},env,fetcher),
    metaGet(`${root}/instagram_accounts`,token,{fields:'id,username',limit:'100'},env,fetcher),
  ]);
  const valid=rows=>Array.isArray(rows)&&rows.length<=100&&rows.every(row=>/^\d+$/.test(row.id||''));
  if(!valid(pages.data)||!valid(instagram.data))throw metaError('META_INVALID_RESPONSE');
  return {pages:pages.data.map(({id,name})=>({id,name:name||id})),instagramAccounts:instagram.data.map(({id,username})=>({id,username:username||id})),currency:account.currency};
}

export async function createMetaAd(pool,input,env=process.env,fetcher=fetch) {
  if(!/^\d+$/.test(input.campaignId||'')||typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>100||typeof input.message!=='string'||!input.message.trim()||input.message.length>2200||typeof input.headline!=='string'||input.headline.trim().length>255||typeof input.destinationUrl!=='string'||input.destinationUrl.length>2048||!Number.isSafeInteger(input.dailyBudgetMinor)||input.dailyBudgetMinor<100)throw Object.assign(new Error('Check the ad name, text, destination URL and daily budget.'),{status:400});
  let destination;try{destination=new URL(input.destinationUrl);}catch{throw Object.assign(new Error('Destination must be a valid HTTPS URL.'),{status:400});}
  if(destination.protocol!=='https:'||destination.username||destination.password||!['LEARN_MORE','SHOP_NOW','SIGN_UP','CONTACT_US','BOOK_NOW','DOWNLOAD','GET_OFFER','WATCH_MORE'].includes(input.callToAction)||input.confirm!==true||!Array.isArray(input.countries)||!input.countries.length||input.countries.length>10||input.countries.some(c=>! /^[A-Z]{2}$/.test(c)))throw Object.assign(new Error('Choose a supported CTA, confirm setup, and provide 1–10 country codes.'),{status:400});
  const {account,token}=await metaAdsContext(pool,input,env,fetcher),root=`/${account.provider_account_id}`;
  const campaign=await metaGet(`/${input.campaignId}`,token,{fields:'id,account_id,name,status,objective'},env,fetcher);
  if(campaign.id!==input.campaignId||String(campaign.account_id)!==account.provider_account_id.slice(4))throw metaError('META_CAMPAIGN_NOT_FOUND',404);
  if(campaign.status!=='PAUSED')throw metaError('META_CAMPAIGN_MUST_BE_PAUSED',409);
  const [options,assetResult]=await Promise.all([
    readMetaAdOptions(pool,input,env,fetcher),
    pool.query('SELECT id,storage_key,filename,content_type,size_bytes FROM assets WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[input.workspaceId,[input.assetId,input.thumbnailAssetId].filter(Boolean)]),
  ]);
  if(!options.pages.some(row=>row.id===input.pageId)||!options.instagramAccounts.some(row=>row.id===input.instagramAccountId))throw Object.assign(new Error('Choose a Facebook Page and Instagram account connected to this ad account.'),{status:400});
  const assets=new Map(assetResult.rows.map(row=>[row.id,row])),asset=assets.get(input.assetId),thumbnail=assets.get(input.thumbnailAssetId||input.assetId);
  if(!asset||!['image/jpeg','image/png','image/webp','video/mp4'].includes(asset.content_type)||asset.size_bytes>50*1024*1024)throw Object.assign(new Error('Choose a workspace image or MP4 video up to 50 MB.'),{status:400});
  if(asset.content_type.startsWith('video/')&&(!thumbnail||!thumbnail.content_type?.startsWith('image/')))throw Object.assign(new Error('Choose an image thumbnail for the video ad.'),{status:400});
  const storage=createStorage(),read=async row=>{const url=await storage.createDownloadUrl({key:row.storage_key}),file=await storage.get(url.url||url);if(!Buffer.isBuffer(file.body)||file.body.length!==Number(row.size_bytes))throw metaError('META_ASSET_READ_FAILED');return file.body;};
  const body=await read(asset),adsets=await metaGet(`/${input.campaignId}/adsets`,token,{fields:'id,name,status,effective_status,ads{id,name,status}',limit:'20'},env,fetcher);
  if(!Array.isArray(adsets.data)||adsets.data.length>20)throw metaError('META_INVALID_RESPONSE');
  let adset=adsets.data.find(row=>row.status==='PAUSED');
  if(!adset){
    const created=await metaPost(`${root}/adsets`,token,{name:`${campaign.name} · Ad set`,campaign_id:campaign.id,daily_budget:String(input.dailyBudgetMinor),billing_event:'IMPRESSIONS',optimization_goal:campaign.objective==='OUTCOME_ENGAGEMENT'?'POST_ENGAGEMENT':'LINK_CLICKS',targeting:JSON.stringify({geo_locations:{countries:[...new Set(input.countries)]},publisher_platforms:['instagram'],instagram_positions:['stream','story','reels']}),status:'PAUSED'},env,fetcher);
    if(!/^\d+$/.test(created.id||''))throw metaError('META_INVALID_RESPONSE');adset={id:created.id,status:'PAUSED',ads:{data:[]}};
  }
  const existing=(adset.ads?.data||[]).find(row=>row.name===input.name.trim());if(existing)throw Object.assign(new Error('An ad with this name already exists in this ad set. Refresh the campaign list.'),{status:409,code:'META_AD_ALREADY_EXISTS'});
  const thumbnailRow=asset.content_type.startsWith('video/')?thumbnail:asset;
  let story;
  if(asset.content_type.startsWith('video/')){
    const thumbBody=await read(thumbnailRow),uploadedThumb=await metaUpload(`${root}/adimages`,token,{field:'bytes',filename:thumbnailRow.filename,contentType:thumbnailRow.content_type,body:thumbBody},env,fetcher),image=Object.values(uploadedThumb.images||{})[0];
    const thumbDownload=await storage.createDownloadUrl({key:thumbnailRow.storage_key}),thumbnailUrl=image?.url||(thumbDownload.url||thumbDownload);
    if(new URL(thumbnailUrl).protocol!=='https:')throw metaError('META_PUBLIC_STORAGE_REQUIRED',503);
    const uploaded=await metaUpload(`${root}/advideos`,token,{field:'source',filename:asset.filename,contentType:asset.content_type,body},env,fetcher);
    if(!/^\d+$/.test(uploaded.id||''))throw metaError('META_INVALID_RESPONSE');
    story={page_id:input.pageId,instagram_user_id:input.instagramAccountId,video_data:{video_id:uploaded.id,image_url:thumbnailUrl,message:input.message.trim(),title:input.headline.trim(),link_description:input.headline.trim(),call_to_action:{type:input.callToAction,value:{link:destination.href}}}};
  }else{
    const uploaded=await metaUpload(`${root}/adimages`,token,{field:'bytes',filename:asset.filename,contentType:asset.content_type,body},env,fetcher),image=Object.values(uploaded.images||{})[0];
    if(typeof image?.hash!=='string')throw metaError('META_INVALID_RESPONSE');
    story={page_id:input.pageId,instagram_user_id:input.instagramAccountId,link_data:{image_hash:image.hash,link:destination.href,message:input.message.trim(),name:input.headline.trim(),call_to_action:{type:input.callToAction,value:{link:destination.href}}}};
  }
  const creative=await metaPost(`${root}/adcreatives`,token,{name:`${input.name.trim()} · Creative`,object_story_spec:JSON.stringify(story)},env,fetcher);
  if(!/^\d+$/.test(creative.id||''))throw metaError('META_INVALID_RESPONSE');
  const ad=await metaPost(`${root}/ads`,token,{name:input.name.trim(),adset_id:adset.id,creative:JSON.stringify({creative_id:creative.id}),status:'PAUSED'},env,fetcher);
  if(!/^\d+$/.test(ad.id||''))throw metaError('META_INVALID_RESPONSE');
  return {adsetId:adset.id,creativeId:creative.id,adId:ad.id,status:'PAUSED',currency:account.currency,dailyBudgetMinor:input.dailyBudgetMinor};
}

export async function setMetaCampaignStatus(pool,input,env=process.env,fetcher=fetch) {
  if(!/^\d+$/.test(input.campaignId||'')||!['ACTIVE','PAUSED'].includes(input.status)||input.confirm!==true)throw Object.assign(new Error('Confirm a valid campaign action.'),{status:400});
  const {account,token}=await metaAdsContext(pool,input,env,fetcher),campaign=await metaGet(`/${input.campaignId}`,token,{fields:'id,account_id,status'},env,fetcher);
  if(campaign.id!==input.campaignId||String(campaign.account_id)!==account.provider_account_id.slice(4))throw metaError('META_CAMPAIGN_NOT_FOUND',404);
  if(input.status==='PAUSED'){await metaPost(`/${campaign.id}`,token,{status:'PAUSED'},env,fetcher);return {campaignId:campaign.id,status:'PAUSED'};}
  const sets=await metaGet(`/${campaign.id}/adsets`,token,{fields:'id,status,ads{id,status}',limit:'100'},env,fetcher);
  if(!Array.isArray(sets.data)||sets.paging?.next)throw metaError('META_AD_STRUCTURE_TOO_LARGE',409);
  const rows=sets.data.filter(set=>set.status!=='ARCHIVED');if(!rows.length||rows.some(set=>!(set.ads?.data||[]).some(ad=>ad.status!=='ARCHIVED')))throw metaError('META_AD_SETUP_REQUIRED',409);
  for(const set of rows){for(const ad of set.ads.data.filter(ad=>ad.status!=='ARCHIVED'))if(ad.status!=='ACTIVE')await metaPost(`/${ad.id}`,token,{status:'ACTIVE'},env,fetcher);if(set.status!=='ACTIVE')await metaPost(`/${set.id}`,token,{status:'ACTIVE'},env,fetcher);}
  await metaPost(`/${campaign.id}`,token,{status:'ACTIVE'},env,fetcher);
  return {campaignId:campaign.id,status:'ACTIVE'};
}
