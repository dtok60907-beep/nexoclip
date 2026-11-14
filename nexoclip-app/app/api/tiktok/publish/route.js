import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';
import { createPublishJob } from '../../../../src/services/tiktokService.mjs';
import { createPhotoPublishJob,photoPublishingReady } from '../../../../src/services/tiktokPhotoPublishing.mjs';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id');
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
    const result=await getPool().query(`SELECT j.id,j.mode,j.media_type,j.status,j.caption,j.privacy_level,j.public_post_ids,j.provider_status,j.provider_error,j.created_at,j.updated_at,a.display_name AS account_name FROM social_publish_jobs j JOIN social_accounts a ON a.id=j.social_account_id AND a.workspace_id=j.workspace_id WHERE j.workspace_id=$1 AND j.user_id=$2 ORDER BY j.created_at DESC LIMIT 30`,[tenant.workspace.id,tenant.user.id]);
    return Response.json({jobs:result.rows,photoEnabled:photoPublishingReady()},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok publishing history unavailable':error.message},{status}); }
}
export async function POST(request) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const body=await request.json(),workspaceId=request.headers.get('x-workspace-id')||body.workspaceId;
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId}); requireCanSpend(tenant);
    if(body.mediaType!==undefined&&!['photo','video'].includes(body.mediaType))return Response.json({error:'Unsupported media type'},{status:400});
    const input={workspaceId:tenant.workspace.id,userId:tenant.user.id,accountId:body.accountId,generationId:body.generationId,mode:body.mode,caption:body.caption,privacyLevel:body.privacyLevel,disableComment:body.disableComment,disableDuet:body.disableDuet,disableStitch:body.disableStitch,brandContentToggle:body.brandContentToggle,brandOrganicToggle:body.brandOrganicToggle,confirm:body.confirm,idempotencyKey:body.idempotencyKey};
    const job=body.mediaType==='photo'
      ?await createPhotoPublishJob(getPool(),{...input,assetIds:body.assetIds,photoTitle:body.photoTitle,photoCoverIndex:body.photoCoverIndex,autoAddMusic:body.autoAddMusic,isAigc:body.isAigc})
      :await createPublishJob(getPool(),input);
    return Response.json({job},{status:202,headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'Could not queue TikTok publishing':error.message},{status}); }
}
