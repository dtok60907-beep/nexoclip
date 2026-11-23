import { SESSION_COOKIE } from '../../../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from '../../../../../../../src/services/tenantContext.js';
import { createMetaAd } from '../../../../../../../src/services/metaService.mjs';
import { getPool } from '../../../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function POST(request,{params}) {
  try{
    if(!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});requireCanSpend(tenant);
    const body=await request.json(),{campaignId}=await params;
    const result=await createMetaAd(getPool(),{...body,campaignId,workspaceId:tenant.workspace.id,userId:tenant.user.id});
    return Response.json(result,{status:201,headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error instanceof SyntaxError?400:500);if(status>=500)console.error('[meta-ad-setup]',{code:error.code||'META_INTERNAL_ERROR',providerCode:error.providerCode,providerSubcode:error.providerSubcode});return Response.json({error:status>=500?'Meta ad could not be set up':error.message,code:error.code,...(error.providerCode?{providerCode:error.providerCode}:{}),...(error.providerSubcode?{providerSubcode:error.providerSubcode}:{}),...(error.providerMessage?{providerMessage:error.providerMessage}:{})},{status,headers:{'Cache-Control':'private,no-store'}});}
}
