import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE,sessionCookieOptions,hashSessionToken } from '../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { metaConfig,metaLoginUrl } from '../../../../../src/providers/meta/adapter.mjs';
import { hashTikTokValue } from '../../../../../src/services/tiktokCrypto.mjs';
import { storeMetaOAuthState } from '../../../../../src/repositories/metaRepository.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function POST(request) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const token=request.cookies.get(SESSION_COOKIE)?.value;
    const tenant=await resolveTenantContext({token,workspaceId:request.headers.get('x-workspace-id')});requireCanSpend(tenant);
    const config=metaConfig();
    // The login and callback must share the browser's session cookie, including through a local HTTPS tunnel.
    if(request.headers.get('origin')!==new URL(config.redirectUri).origin)return Response.json({error:'Open Nexoclip using the HTTPS callback domain before connecting Instagram.'},{status:409});
    const state=randomBytes(32).toString('base64url');
    await storeMetaOAuthState(getPool(),{stateHash:hashTikTokValue(state),sessionHash:hashSessionToken(token),userId:tenant.user.id,workspaceId:tenant.workspace.id,config});
    const response=NextResponse.json({url:metaLoginUrl(config,state)},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set('meta_oauth_state',state,{...sessionCookieOptions(request),httpOnly:true,secure:true,maxAge:600});return response;
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:503);return Response.json({error:status>=500?'Instagram connection is not configured yet. Set the Meta App Secret and HTTPS callback.':error.message},{status});}
}
