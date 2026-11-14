import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';
import { listTikTokPublishMedia } from '../../../../src/repositories/tiktokPublishMediaRepository.mjs';
import { photoPublishingReady } from '../../../../src/services/tiktokPhotoPublishing.mjs';
export const runtime='nodejs';
export async function GET(request){
  try{
    const url=new URL(request.url);
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id')});
    return Response.json({...await listTikTokPublishMedia(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id}),photoEnabled:photoPublishingReady()},{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'Publishing media unavailable':error.message},{status});}
}
