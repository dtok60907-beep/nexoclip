import { SESSION_COOKIE } from '../../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../../src/db/pool.js';
import { queueTikTokProfileSync } from '../../../../../../src/repositories/tiktokProfileRepository.mjs';

export const runtime='nodejs';
export async function POST(request,{params}) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const url=new URL(request.url);
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id')});
    requireCanSpend(tenant);
    const {accountId}=await params;
    if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(accountId))return Response.json({error:'Invalid account'},{status:400});
    await queueTikTokProfileSync(getPool(),{accountId,workspaceId:tenant.workspace.id,userId:tenant.user.id});
    return Response.json({queued:true},{status:202});
  }catch(error){
    const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);
    return Response.json({error:status>=500?'Could not queue profile refresh':error.message},{status});
  }
}
