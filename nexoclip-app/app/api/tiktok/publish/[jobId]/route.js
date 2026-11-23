import { findSocialPublishJob } from '../../../../../src/repositories/socialPublishRepository.mjs';
import { actOnSocialPublishJob } from '../../../../../src/services/socialPublishActions.mjs';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext, requireCanSpend } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request,{params}) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id'),{jobId}=await params;
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
    if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(jobId))return Response.json({error:'Invalid publishing job ID'},{status:400});
    const job=await findSocialPublishJob(getPool(),{jobId,workspaceId:tenant.workspace.id,userId:tenant.user.id});
    return job?Response.json({job},{headers:{'Cache-Control':'private,no-store'}}):Response.json({error:'Publishing job not found'},{status:404});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok publishing status unavailable':error.message},{status}); }
}

export async function PATCH(request,{params}) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const {jobId}=await params;
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});
    requireCanSpend(tenant);
    if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(jobId))return Response.json({error:'Invalid publishing job ID'},{status:400});
    const body=await request.json();
    const job=await actOnSocialPublishJob(getPool(),{jobId,workspaceId:tenant.workspace.id,userId:tenant.user.id,action:body.action,scheduledAt:body.scheduledAt,timeZone:body.timeZone});
    return Response.json({job},{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'Could not update TikTok publishing status. No new post was sent.':error.message},{status}); }
}
