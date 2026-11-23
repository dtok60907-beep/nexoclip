import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { disconnectMetaConnection } from '../../../../../src/repositories/metaRepository.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function DELETE(request,{params}) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});requireCanSpend(tenant);
    const {integrationId}=await params;
    if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(integrationId))return Response.json({error:'Invalid Meta connection ID'},{status:400});
    const disconnected=await disconnectMetaConnection(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,integrationId});
    return Response.json(disconnected?{disconnected:true}:{error:'Connection not found'},{status:disconnected?200:404,headers:{'Cache-Control':'no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'Could not disconnect Meta':error.message},{status});}
}
