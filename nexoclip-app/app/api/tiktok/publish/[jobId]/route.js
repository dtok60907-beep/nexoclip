import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request,{params}) {
  try {
    const url=new URL(request.url),workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id'),{jobId}=await params;
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
    const result=await getPool().query(`SELECT id,mode,media_type,status,caption,privacy_level,public_post_ids,provider_status,provider_error,created_at,updated_at FROM social_publish_jobs WHERE id=$1 AND workspace_id=$2 AND user_id=$3`,[jobId,tenant.workspace.id,tenant.user.id]);
    return result.rowCount?Response.json({job:result.rows[0]},{headers:{'Cache-Control':'private,no-store'}}):Response.json({error:'Publishing job not found'},{status:404});
  } catch(error) { const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500); return Response.json({error:status>=500?'TikTok publishing status unavailable':error.message},{status}); }
}
