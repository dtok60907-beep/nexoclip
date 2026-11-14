import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
import { disconnectTikTok } from '../../../../../src/services/tiktokService.mjs';
export const runtime='nodejs';
export async function DELETE(request,{params}) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId}); requireCanSpend(tenant);
    const {accountId}=await params;
    if(!await disconnectTikTok(getPool(),accountId,tenant.workspace.id,tenant.user.id)) return Response.json({error:'TikTok account not found'},{status:404});
    return Response.json({ok:true});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'Could not disconnect TikTok':error.message},{status}); }
}
