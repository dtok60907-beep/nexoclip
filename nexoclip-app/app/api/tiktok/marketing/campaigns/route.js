import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { listTikTokMarketingCampaigns } from '../../../../../src/services/tiktokMarketing.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request){
  try{const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')}),advertiserId=new URL(request.url).searchParams.get('advertiser_id');const campaigns=await listTikTokMarketingCampaigns(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,advertiserId});return Response.json({campaigns},{headers:{'Cache-Control':'private,no-store'}});}
  catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'TikTok campaigns unavailable':error.message},{status});}
}
