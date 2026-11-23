import { SESSION_COOKIE } from '../../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../../src/services/tenantContext.js';
import { createMetaPausedCampaign } from '../../../../../../src/services/metaService.mjs';
import { getPool } from '../../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function POST(request) {
  try {
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});requireCanSpend(tenant);
    const body=await request.json();
    const result=await createMetaPausedCampaign(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,accountId:body.accountId,name:body.name,objective:body.objective,specialCategory:body.specialCategory,dailyBudgetMinor:body.dailyBudgetMinor,countries:body.countries,confirm:body.confirm});
    return Response.json(result,{status:201,headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error instanceof SyntaxError?400:500);if(status>=500)console.error('[meta-campaign-create]',{code:error.code||'META_INTERNAL_ERROR',name:error.name,providerCode:error.providerCode,providerSubcode:error.providerSubcode,causeCode:error.causeCode,campaignId:error.campaignId});return Response.json({error:status>=500?(error.message==='Campaign created paused, but its ad set was not. Open Ads Manager and finish setup there.'?error.message:'Meta campaign could not be created'):error.message,...(status>=500||error.code?{code:error.code||'META_INTERNAL_ERROR'}:{}),...(Number.isSafeInteger(error.providerCode)?{providerCode:error.providerCode}:{}),...(Number.isSafeInteger(error.providerSubcode)?{providerSubcode:error.providerSubcode}:{}),...(typeof error.providerMessage==='string'?{providerMessage:error.providerMessage}:{}),...(error.campaignId?{campaignId:error.campaignId}:{}),...(error.causeCode?{causeCode:error.causeCode}:{}),...(Number.isSafeInteger(error.causeProviderCode)?{causeProviderCode:error.causeProviderCode}:{}),...(Number.isSafeInteger(error.causeProviderSubcode)?{causeProviderSubcode:error.causeProviderSubcode}:{}),...(typeof error.causeProviderMessage==='string'?{causeProviderMessage:error.causeProviderMessage}:{}),...(Number.isSafeInteger(error.causeProviderHttpStatus)?{causeProviderHttpStatus:error.causeProviderHttpStatus}:{})},{status,headers:{'Cache-Control':'private,no-store'}});}
}
