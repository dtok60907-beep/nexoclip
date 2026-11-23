import { SESSION_COOKIE } from '../../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../../src/services/tenantContext.js';
import { setTikTokMarketingCampaignStatus } from '../../../../../../src/services/tiktokMarketing.mjs';
import { getPool } from '../../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function POST(request){
  try{if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')}),body=await request.json();if(body.status==='ENABLE')requireCanSpend(tenant);const result=await setTikTokMarketingCampaignStatus(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,advertiserId:body.advertiserId,campaignId:body.campaignId,status:body.status,automationType:body.automationType,confirm:body.confirm});return Response.json(result,{headers:{'Cache-Control':'private,no-store'}});}
  catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error instanceof SyntaxError?400:500);if(status>=500)console.error('[tiktok-marketing-status]',{code:error.code||'TIKTOK_MARKETING_STATUS_FAILED'});return Response.json({error:status>=500?'TikTok campaign status could not be changed':error.message,code:error.code},{status,headers:{'Cache-Control':'private,no-store'}});}
}
