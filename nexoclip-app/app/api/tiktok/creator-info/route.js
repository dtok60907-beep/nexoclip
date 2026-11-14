import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';
import { creatorInfo } from '../../../../src/services/tiktokService.mjs';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id'),accountId=url.searchParams.get('account_id');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
    const own=await getPool().query("SELECT id,granted_scopes FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected'",[accountId,tenant.workspace.id,tenant.user.id]);
    if(!own.rowCount) return Response.json({error:'TikTok account not found'},{status:404});
    if(!own.rows[0].granted_scopes.includes('video.publish'))return Response.json({error:'Reconnect TikTok and grant video.publish for direct posting'},{status:403});
    const info=await creatorInfo(getPool(),accountId);
    if(process.env.TIKTOK_ENV!=='production'||process.env.TIKTOK_APP_AUDITED!=='true') info.privacy_level_options=(info.privacy_level_options||[]).filter(value=>value==='SELF_ONLY');
    return Response.json({...info,privateOnly:process.env.TIKTOK_ENV!=='production'||process.env.TIKTOK_APP_AUDITED!=='true'},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok creator information unavailable':error.message},{status}); }
}
