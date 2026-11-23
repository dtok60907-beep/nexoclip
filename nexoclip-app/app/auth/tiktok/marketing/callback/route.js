import { NextResponse } from 'next/server';
import { SESSION_COOKIE,hashSessionToken } from '../../../../../src/lib/auth/session.js';
import { publicAppOrigin } from '../../../../../src/lib/auth/sameOrigin.js';
import { consumeTikTokMarketingState } from '../../../../../src/repositories/tiktokMarketingRepository.mjs';
import { hashTikTokValue } from '../../../../../src/services/tiktokCrypto.mjs';
import { exchangeTikTokMarketingCode } from '../../../../../src/services/tiktokMarketing.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
  const origin=new URL('/studio/accounts',publicAppOrigin(request)),fail=reason=>{origin.searchParams.set('tiktokMarketing',reason);return NextResponse.redirect(origin);};
  try{
    const url=new URL(request.url),state=url.searchParams.get('state'),authCode=url.searchParams.get('auth_code')||url.searchParams.get('code');
    if(!state||!authCode||state!==request.cookies.get('tiktok_marketing_oauth_state')?.value)return fail('state_invalid');
    const pool=getPool(),session=await consumeTikTokMarketingState(pool,{stateHash:hashTikTokValue(state),sessionHash:hashSessionToken(request.cookies.get(SESSION_COOKIE)?.value||'')});
    if(!session)return fail('state_expired');
    const result=await exchangeTikTokMarketingCode(pool,{workspaceId:session.workspace_id,userId:session.user_id,authCode});
    origin.searchParams.set('tiktokMarketing','connected');origin.searchParams.set('accounts',String(result.advertiserIds.length));
    const response=NextResponse.redirect(origin);response.cookies.delete('tiktok_marketing_oauth_state');return response;
  }catch(error){console.error('[tiktok-marketing-callback]',{code:error.code||'TIKTOK_MARKETING_CALLBACK_FAILED'});return fail(error.status===503?'not_configured':'connection_failed');}
}
