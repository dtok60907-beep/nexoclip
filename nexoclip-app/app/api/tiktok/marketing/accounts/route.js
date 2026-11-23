import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { listTikTokMarketingAccounts } from '../../../../../src/repositories/tiktokMarketingRepository.mjs';
import { tikTokMarketingConfig } from '../../../../../src/services/tiktokMarketing.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request){
  try{const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});let configured=true;try{tikTokMarketingConfig();}catch{configured=false;}return Response.json({accounts:await listTikTokMarketingAccounts(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id}),configured},{headers:{'Cache-Control':'private,no-store'}});}
  catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'TikTok advertiser accounts unavailable':error.message},{status});}
}
