import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
import { hashTikTokValue, encryptTikTokSecret, createTikTokPkce } from '../../../../../src/services/tiktokCrypto.mjs';
import { TIKTOK_SCOPE } from '../../../../../src/services/tiktokService.mjs';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request) {
  try {
    const url=new URL(request.url), workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId}); requireCanSpend(tenant);
    for (const name of ['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','TIKTOK_REDIRECT_URI','TIKTOK_TOKEN_ENCRYPTION_KEY']) if (!process.env[name]) throw new Error(`${name} is not configured`);
    const state=randomBytes(32).toString('base64url'), stateHash=hashTikTokValue(state);
    const redirectUri=process.env.TIKTOK_REDIRECT_URI;
    const isDesktop=/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/|$)/i.test(redirectUri);
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?:\/|$)/i.test(redirectUri) && !isDesktop) throw new Error('TikTok Desktop redirect URI must include a port');
    const pkce=isDesktop?createTikTokPkce():null;
    const pool=getPool(); await pool.query('DELETE FROM tiktok_oauth_states WHERE expires_at<now()');
    await pool.query('INSERT INTO tiktok_oauth_states(state_hash,user_id,workspace_id,expires_at,code_verifier_encrypted) VALUES($1,$2,$3,now()+interval \'10 minutes\',$4)',[stateHash,tenant.user.id,tenant.workspace.id,pkce?encryptTikTokSecret(pkce.verifier):null]);
    const auth=new URL('https://www.tiktok.com/v2/auth/authorize/');
    auth.search=new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY,scope:TIKTOK_SCOPE,response_type:'code',redirect_uri:redirectUri,state,...(pkce?{code_challenge:pkce.challenge,code_challenge_method:'S256'}:{})}).toString();
    const response=NextResponse.redirect(auth);
    response.cookies.set('tiktok_oauth_state',state,{...sessionCookieOptions(request),httpOnly:true,maxAge:600});
    return response;
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error.message==='Mode lihat saja: saat impersonate, data akun ini tidak bisa diubah.'?403:503); return Response.json({error:status>=500?'TikTok connection is unavailable':error.message},{status}); }
}
