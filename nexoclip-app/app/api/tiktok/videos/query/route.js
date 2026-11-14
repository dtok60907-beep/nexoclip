import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
import { queryTikTokVideos } from '../../../../../src/services/tiktokVideoQuery.mjs';
export const runtime='nodejs';
export async function POST(request){
  try{
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const body=await request.json();
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')||body.workspaceId});requireCanSpend(tenant);
    return Response.json(await queryTikTokVideos(getPool(),{accountId:body.accountId,workspaceId:tenant.workspace.id,userId:tenant.user.id,videoIds:body.videoIds}),{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'Could not refresh TikTok video details':error.message},{status});}
}
