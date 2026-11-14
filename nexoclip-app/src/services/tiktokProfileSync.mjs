import { getTikTokAccessToken } from './tiktokService.mjs';
import { tikTokUserInfo } from './tiktokApi.mjs';
import { claimTikTokProfileSync, saveTikTokProfile, failTikTokProfileSync } from '../repositories/tiktokProfileRepository.mjs';

export async function syncDueTikTokProfiles(pool,env=process.env,fetcher=fetch,getToken=getTikTokAccessToken) {
  const account=await claimTikTokProfileSync(pool);
  if(!account)return;
  try {
    const token=await getToken(pool,account.id,env,fetcher);
    const profile=await tikTokUserInfo(token,fetcher,account.granted_scopes);
    if(!profile.open_id||profile.open_id!==account.provider_account_id)throw Object.assign(new Error('Incomplete TikTok profile'),{code:'INVALID_PROFILE'});
    await saveTikTokProfile(pool,account,profile);
  }catch(error){await failTikTokProfileSync(pool,account,error);}
}
