import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';

export const runtime='nodejs';
export async function GET(request) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
    const result=await getPool().query(`SELECT id,provider_account_id,display_name,avatar_url,granted_scopes,status,created_at,updated_at,profile_data,profile_synced_at,profile_sync_error,posts_synced_at,posts_sync_error,posts_sync_run_id IS NOT NULL AS posts_syncing FROM social_accounts WHERE workspace_id=$1 AND user_id=$2 AND provider='tiktok' AND status<>'disconnected' ORDER BY created_at DESC`,[tenant.workspace.id,tenant.user.id]);
    const configured = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI && process.env.TIKTOK_TOKEN_ENCRYPTION_KEY);
    return Response.json({accounts:result.rows,configured},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok accounts are unavailable':error.message},{status}); }
}
