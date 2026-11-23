import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { readMetaAdInsights } from '../../../../../src/services/metaService.mjs';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});
    const url=new URL(request.url);
    const data=await readMetaAdInsights(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,accountId:url.searchParams.get('account_id'),period:url.searchParams.get('period')||'last_7d'});
    return Response.json(data,{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);return Response.json({error:status>=500?'Meta insights temporarily unavailable':error.message},{status});}
}
