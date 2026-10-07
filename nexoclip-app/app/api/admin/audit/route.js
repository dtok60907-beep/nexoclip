import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { adminAuditService } from '../../../../src/services/adminAuditService.js';
import { requirePlatformOperator } from '../../../../src/lib/auth/platformOperator.js';

export function createAdminAuditGetHandler({resolveContext=resolveTenantContext,service=adminAuditService,env=process.env}={}) {
  return async function GET(request) {
    const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
    try {
      const url=new URL(request.url);
      const workspaceId=request.headers.get('x-workspace-id')||url.searchParams.get('workspace_id');
      if(!workspaceId)return Response.json({error:'workspace_id is required'},{status:400,headers});
      const tenant=await resolveContext({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId});
      requirePlatformOperator(tenant.user.id,env);
      const type=url.searchParams.get('type')||'jobs';
      const args={workspaceId:tenant.workspace.id,userId:tenant.user.id,role:tenant.workspace.role,filters:Object.fromEntries(url.searchParams)};
      const data=type==='usage'?await service.listUsage(args):type==='credits'?await service.listCredits(args):type==='jobs'?await service.listJobs(args):null;
      if(!data)return Response.json({error:'Invalid audit type'},{status:400,headers});
      return Response.json(data,{headers});
    }catch(error){
      const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:500);
      return Response.json({error:status>=500?'Audit tidak dapat dimuat':error.message,code:error.code},{status,headers});
    }
  };
}
export const GET=createAdminAuditGetHandler();
