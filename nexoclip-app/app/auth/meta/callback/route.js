import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE,hashSessionToken } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext,requireCanSpend } from '../../../../src/services/tenantContext.js';
import { hashTikTokValue,matchesTikTokOAuthState } from '../../../../src/services/tiktokCrypto.mjs';
import { metaConfig } from '../../../../src/providers/meta/adapter.mjs';
import { consumeMetaOAuthState } from '../../../../src/repositories/metaRepository.mjs';
import { completeMetaConnection } from '../../../../src/services/metaService.mjs';
import { getPool } from '../../../../src/db/pool.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request) {
  const finish=(status)=>{
    // Never reflect Meta's code/state into the destination URL or a referrer.
    const response=NextResponse.redirect(new URL(`/studio/accounts?meta=${status}`,process.env.META_REDIRECT_URI||request.url));
    response.cookies.delete('meta_oauth_state');response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  };
  try {
    const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
    if(!state||state.length>128||!matchesTikTokOAuthState(state,request.cookies.get('meta_oauth_state')?.value))return finish('state_invalid');
    const pool=getPool(),token=request.cookies.get(SESSION_COOKIE)?.value;
    const saved=await consumeMetaOAuthState(pool,{stateHash:hashTikTokValue(state),sessionHash:hashSessionToken(token||'')});
    if(!saved)return finish('state_expired');
    if(url.searchParams.has('error'))return finish('cancelled');
    if(!code||code.length>4096)return finish('code_missing');
    const config=metaConfig();
    if(saved.app_id!==config.appId||saved.config_id!==config.configId||saved.redirect_uri!==config.redirectUri)return finish('configuration_changed');
    const tenant=await resolveTenantContext({token,workspaceId:saved.workspace_id});requireCanSpend(tenant);
    await completeMetaConnection(pool,{workspaceId:tenant.workspace.id,userId:tenant.user.id,code});return finish('connected');
  }catch{return finish('connection_failed');}
}
