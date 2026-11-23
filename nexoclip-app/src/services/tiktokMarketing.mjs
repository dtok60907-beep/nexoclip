import { encryptTikTokSecret,decryptTikTokSecret } from './tiktokCrypto.mjs';
import { saveTikTokMarketingAccounts,findTikTokMarketingCredentials } from '../repositories/tiktokMarketingRepository.mjs';

const API='https://business-api.tiktok.com/open_api/v1.3';
const marketingError=(code,status=502)=>Object.assign(new Error(({TIKTOK_MARKETING_CONFIG:'TikTok Marketing API is not configured.',TIKTOK_MARKETING_AUTH:'Reconnect the TikTok for Business advertiser account.',TIKTOK_MARKETING_DENIED:'TikTok did not authorize this advertiser operation.',TIKTOK_MARKETING_RATE:'TikTok is limiting ad requests. Wait and try again.',TIKTOK_MARKETING_NOT_FOUND:'TikTok advertiser or campaign not found.',TIKTOK_MARKETING_RESPONSE:'TikTok returned an invalid Marketing API response.'})[code]||'TikTok Marketing API is unavailable.'),{code,status});

export function tikTokMarketingConfig(env=process.env){
  if(!/^\d+$/.test(env.TIKTOK_MARKETING_APP_ID||'')||!env.TIKTOK_MARKETING_APP_SECRET||!env.TIKTOK_MARKETING_AUTH_URL||!/^https:\/\//.test(env.TIKTOK_MARKETING_REDIRECT_URI||''))throw marketingError('TIKTOK_MARKETING_CONFIG',503);
  const auth=new URL(env.TIKTOK_MARKETING_AUTH_URL),redirect=new URL(env.TIKTOK_MARKETING_REDIRECT_URI);
  if(auth.protocol!=='https:'||auth.hostname!=='business-api.tiktok.com'||redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.search||redirect.hash||redirect.pathname!=='/auth/tiktok/marketing/callback')throw marketingError('TIKTOK_MARKETING_CONFIG',503);
  return {appId:env.TIKTOK_MARKETING_APP_ID,appSecret:env.TIKTOK_MARKETING_APP_SECRET,authUrl:auth.href,redirectUri:redirect.href};
}

async function request(path,{token,body,query={},fetcher=fetch}={}){
  const url=new URL(`${API}${path}`);for(const [key,value] of Object.entries(query))url.searchParams.set(key,typeof value==='string'?value:JSON.stringify(value));
  let response,data;try{response=await fetcher(url.href,{method:body?'POST':'GET',headers:{...(token?{'Access-Token':token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30_000)});data=await response.json();}catch{throw marketingError('TIKTOK_MARKETING_NETWORK');}
  if(!response.ok||data?.code!==0){const code=Number(data?.code);throw marketingError(code===40100?'TIKTOK_MARKETING_RATE':code===40103||code===40104?'TIKTOK_MARKETING_AUTH':code===40001?'TIKTOK_MARKETING_DENIED':'TIKTOK_MARKETING_API',response.status===429?429:502);}
  if(!data?.data||typeof data.data!=='object')throw marketingError('TIKTOK_MARKETING_RESPONSE');return data.data;
}

export async function exchangeTikTokMarketingCode(pool,{workspaceId,userId,authCode},env=process.env,fetcher=fetch){
  const config=tikTokMarketingConfig(env);if(typeof authCode!=='string'||authCode.length<8||authCode.length>512)throw Object.assign(new Error('TikTok authorization code is missing or invalid.'),{status:400});
  const data=await request('/oauth2/access_token/',{body:{app_id:config.appId,secret:config.appSecret,auth_code:authCode},fetcher});
  const advertiserIds=Array.isArray(data.advertiser_ids)?[...new Set(data.advertiser_ids.map(String))]:[];
  if(typeof data.access_token!=='string'||!data.access_token||!advertiserIds.length||advertiserIds.length>100||advertiserIds.some(id=>!/^\d+$/.test(id)))throw marketingError('TIKTOK_MARKETING_RESPONSE');
  await saveTikTokMarketingAccounts(pool,{workspaceId,userId,appId:config.appId,advertiserIds,encryptedToken:encryptTikTokSecret(data.access_token,env)});
  return {advertiserIds};
}

async function accessFor(pool,input,env){
  if(typeof input.advertiserId!=='string'||!/^\d+$/.test(input.advertiserId))throw Object.assign(new Error('Choose a TikTok advertiser account.'),{status:400});
  const account=await findTikTokMarketingCredentials(pool,input);if(!account)throw marketingError('TIKTOK_MARKETING_NOT_FOUND',404);
  if(account.app_id!==tikTokMarketingConfig(env).appId)throw marketingError('TIKTOK_MARKETING_AUTH',409);
  return decryptTikTokSecret(account.access_token_encrypted,env);
}

export async function listTikTokMarketingCampaigns(pool,input,env=process.env,fetcher=fetch){
  const token=await accessFor(pool,input,env),data=await request('/campaign/get/',{token,query:{advertiser_id:input.advertiserId,filtering:{primary_status:'STATUS_NOT_DELETE'},page:1,page_size:100},fetcher});
  if(!Array.isArray(data.list)||data.list.length>100||data.list.some(row=>typeof row.campaign_id!=='string'||typeof row.campaign_name!=='string'))throw marketingError('TIKTOK_MARKETING_RESPONSE');
  return data.list.map(row=>({id:row.campaign_id,name:row.campaign_name,objective:row.objective_type||row.objective||'',status:row.operation_status||'',secondaryStatus:row.secondary_status||'',budget:Number(row.budget)||0,budgetMode:row.budget_mode||'',automationType:row.campaign_automation_type||''}));
}

export async function setTikTokMarketingCampaignStatus(pool,input,env=process.env,fetcher=fetch){
  if(typeof input.campaignId!=='string'||!/^\d+$/.test(input.campaignId)||!['ENABLE','DISABLE'].includes(input.status)||input.confirm!==true)throw Object.assign(new Error('Confirm a valid TikTok campaign action.'),{status:400});
  const token=await accessFor(pool,input,env),data=await request('/campaign/get/',{token,query:{advertiser_id:input.advertiserId,filtering:{campaign_ids:[input.campaignId],primary_status:'STATUS_NOT_DELETE'},page:1,page_size:1},fetcher});
  const campaign=data.list?.find(row=>String(row.campaign_id)===input.campaignId);if(!campaign)throw marketingError('TIKTOK_MARKETING_NOT_FOUND',404);
  const smart=campaign.campaign_automation_type==='UPGRADED_SMART_PLUS';
  const result=await request(smart?'/smart_plus/campaign/status/update/':'/campaign/status/update/',{token,body:{advertiser_id:input.advertiserId,campaign_ids:[input.campaignId],operation_status:input.status},fetcher});
  const rows=result.campaign_list||result.list||[];
  if(result.error_list?.length||(rows.length&&!rows.some(row=>String(row.campaign_id)===input.campaignId)))throw marketingError('TIKTOK_MARKETING_API');
  return {campaignId:input.campaignId,status:input.status};
}
