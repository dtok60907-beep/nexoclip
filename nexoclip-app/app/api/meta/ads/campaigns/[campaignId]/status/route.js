import { SESSION_COOKIE } from '../../../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../../../src/services/tenantContext.js';
import { setMetaCampaignStatus } from '../../../../../../../src/services/metaService.mjs';
import { getPool } from '../../../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function POST(request,{params}) {
  try{
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});
    const body=await request.json();if(body.status==='ACTIVE')requireCanSpend(tenant);
    const {campaignId}=await params,result=await setMetaCampaignStatus(getPool(),{accountId:body.accountId,campaignId,status:body.status,confirm:body.confirm,workspaceId:tenant.workspace.id,userId:tenant.user.id});
    return Response.json(result,{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error instanceof SyntaxError?400:500);if(status>=500)console.error('[meta-campaign-status]',{code:error.code||'META_INTERNAL_ERROR',providerCode:error.providerCode});return Response.json({error:status>=500?'Meta campaign status could not be changed':error.message,code:error.code},{status,headers:{'Cache-Control':'private,no-store'}});}
}
