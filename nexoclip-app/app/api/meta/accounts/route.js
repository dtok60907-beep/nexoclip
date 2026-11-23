import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { listMetaConnections,listMetaAdAccounts } from '../../../../src/repositories/metaRepository.mjs';
import { metaConfig } from '../../../../src/providers/meta/adapter.mjs';
import { getPool } from '../../../../src/db/pool.js';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const tenant=await resolveTenantContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});
    const owner={workspaceId:tenant.workspace.id,userId:tenant.user.id};
    const [connections,adAccounts]=await Promise.all([listMetaConnections(getPool(),owner),listMetaAdAccounts(getPool(),owner)]);
    let configured=true;try{metaConfig();}catch{configured=false;}
    return Response.json({...connections,adAccounts,configured},{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){const status=error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500;return Response.json({error:status===500?'Meta accounts unavailable':error.message},{status});}
}
