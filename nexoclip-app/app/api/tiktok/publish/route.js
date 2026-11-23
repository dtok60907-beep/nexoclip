import { listSocialPublishJobs } from '../../../../src/repositories/socialPublishRepository.mjs';
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
    const jobs=await listSocialPublishJobs(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id});
    return Response.json({jobs,photoEnabled:photoPublishingReady()},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok publishing history unavailable':error.message},{status}); }
}
export async function POST(request) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const body=await request.json(),workspaceId=request.headers.get('x-workspace-id')||body.workspaceId;
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId}); requireCanSpend(tenant);
    if(body.mediaType!==undefined&&!['photo','video'].includes(body.mediaType))return Response.json({error:'Unsupported media type'},{status:400});
    const input={workspaceId:tenant.workspace.id,userId:tenant.user.id,accountId:body.accountId,generationId:body.generationId,mode:body.mode,caption:body.caption,privacyLevel:body.privacyLevel,disableComment:body.disableComment,disableDuet:body.disableDuet,disableStitch:body.disableStitch,brandContentToggle:body.brandContentToggle,brandOrganicToggle:body.brandOrganicToggle,confirm:body.confirm,idempotencyKey:body.idempotencyKey,scheduledAt:body.scheduledAt,timeZone:body.timeZone};
    const job=body.mediaType==='photo'
      ?await createPhotoPublishJob(getPool(),{...input,assetIds:body.assetIds,photoTitle:body.photoTitle,photoCoverIndex:body.photoCoverIndex,autoAddMusic:body.autoAddMusic,isAigc:body.isAigc})
      :await createPublishJob(getPool(),input);
    return Response.json({job},{status:202,headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'Could not queue TikTok publishing':error.message},{status}); }
}
