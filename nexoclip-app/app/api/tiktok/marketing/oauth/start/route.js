import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE,sessionCookieOptions,hashSessionToken } from '../../../../../../src/lib/auth/session.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../../src/services/tenantContext.js';
import { tikTokMarketingConfig } from '../../../../../../src/services/tiktokMarketing.mjs';
import { hashTikTokValue } from '../../../../../../src/services/tiktokCrypto.mjs';
import { storeTikTokMarketingState } from '../../../../../../src/repositories/tiktokMarketingRepository.mjs';
import { getPool } from '../../../../../../src/db/pool.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
  try{
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});requireCanSpend(tenant);
    const config=tikTokMarketingConfig(),state=randomBytes(32).toString('base64url');
    await storeTikTokMarketingState(getPool(),{stateHash:hashTikTokValue(state),workspaceId:tenant.workspace.id,userId:tenant.user.id,sessionHash:hashSessionToken(request.cookies.get(SESSION_COOKIE)?.value||'')});
    const auth=new URL(config.authUrl);auth.searchParams.set('state',state);
    const response=NextResponse.redirect(auth);response.cookies.set('tiktok_marketing_oauth_state',state,{...sessionCookieOptions(request),httpOnly:true,maxAge:900});return response;
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:503);return Response.json({error:status>=500?'TikTok Marketing API connection is unavailable':error.message},{status});}
}
