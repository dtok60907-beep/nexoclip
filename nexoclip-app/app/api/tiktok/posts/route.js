import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';
import { listTikTokPosts } from '../../../../src/repositories/tiktokPostsRepository.mjs';

export const runtime='nodejs';
export async function GET(request) {
  try {
    const url=new URL(request.url);
    const offset=Number(url.searchParams.get('offset')||0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000) return Response.json({error:'Invalid page'},{status:400});
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id')});
    return Response.json(await listTikTokPosts(getPool(),{workspaceId:tenant.workspace.id,userId:tenant.user.id,offset}),{headers:{'Cache-Control':'private,no-store'}});
  } catch(error) {
    const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);
    return Response.json({error:status>=500?'TikTok posts unavailable':error.message},{status});
  }
}
