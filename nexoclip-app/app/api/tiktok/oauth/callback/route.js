import { NextResponse } from 'next/server';
import { SESSION_COOKIE, hashSessionToken } from '../../../../../src/lib/auth/session.js';
import { publicAppOrigin } from '../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
import { hashTikTokValue, matchesTikTokOAuthState, decryptTikTokSecret } from '../../../../../src/services/tiktokCrypto.mjs';
import { exchangeTikTokCode, tikTokUserInfo } from '../../../../../src/services/tiktokApi.mjs';
import { saveTikTokAccount } from '../../../../../src/services/tiktokService.mjs';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request) {
  const origin=new URL('/studio/accounts',publicAppOrigin(request));
  const fail=(reason)=>{origin.searchParams.set('tiktok',reason);return NextResponse.redirect(origin);};
  try {
    const url=new URL(request.url), state=url.searchParams.get('state'), code=url.searchParams.get('code');
    if (!state || !code || !matchesTikTokOAuthState(state,request.cookies.get('tiktok_oauth_state')?.value)) return fail('state_invalid');
    const pool=getPool(), stateHash=hashTikTokValue(state);
    const session=await pool.query(`DELETE FROM tiktok_oauth_states s USING sessions se WHERE s.state_hash=$1 AND s.expires_at>now() AND se.token_hash=$2 AND se.user_id=s.user_id AND se.revoked_at IS NULL AND se.expires_at>now() RETURNING s.user_id,s.workspace_id,s.code_verifier_encrypted`,[stateHash,hashSessionToken(request.cookies.get(SESSION_COOKIE)?.value||'')]);
    if (!session.rowCount) return fail('state_expired');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:session.rows[0].workspace_id}); requireCanSpend(tenant);
    const verifier=session.rows[0].code_verifier_encrypted?decryptTikTokSecret(session.rows[0].code_verifier_encrypted):null;
    const token=await exchangeTikTokCode(code,process.env.TIKTOK_REDIRECT_URI,process.env,fetch,verifier);
    const profile=await tikTokUserInfo(token.access_token,fetch,String(token.scope||'').split(/[\s,]+/));
    if (!String(token.scope||'').split(/[\s,]+/).includes('user.info.basic')) throw new Error('TikTok did not grant user.info.basic');
    await saveTikTokAccount(pool,{userId:session.rows[0].user_id,workspaceId:session.rows[0].workspace_id,tokenData:token,userInfo:profile,env:process.env});
    origin.searchParams.set('tiktok','connected');
    const response=NextResponse.redirect(origin); response.cookies.delete('tiktok_oauth_state'); return response;
  } catch(error) { return fail(error.message.includes('DATABASE_URL')?'server_unavailable':'connection_failed'); }
}
