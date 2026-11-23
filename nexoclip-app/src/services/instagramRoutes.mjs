import { SESSION_COOKIE } from '../lib/auth/session.js';
import { isSameOriginRequest } from '../lib/auth/sameOrigin.js';
import { resolveTenantContext,requireCanSpend } from './tenantContext.js';
import { getPool } from '../db/pool.js';
import { listInstagramPosts,listInstagramJobs,queueInstagramSync } from '../repositories/instagramRepository.mjs';
import { createInstagramPublishJob } from './instagramService.mjs';

export function instagramHandler(action,{resolveTenant=resolveTenantContext,pool=getPool,sync=queueInstagramSync,publish=createInstagramPublishJob,posts=listInstagramPosts,jobs=listInstagramJobs}={}) {
  return async(request,context={})=>{
    try {
      const write=request.method==='POST';
      if(write&&!isSameOriginRequest(request))return Response.json({error:'Invalid request origin'},{status:403});
      const tenant=await resolveTenant({token:request.cookies.get(SESSION_COOKIE)?.value,workspaceId:request.headers.get('x-workspace-id')});
      if(write)requireCanSpend(tenant);
      const owner={workspaceId:tenant.workspace.id,userId:tenant.user.id};let data;
      if(action==='posts')data=await posts(pool(),{...owner,offset:Number(new URL(request.url).searchParams.get('offset')||0)});
      else if(action==='sync'){
        const {accountId}=await context.params;
        if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(accountId||''))return Response.json({error:'Invalid account'},{status:400});
        await sync(pool(),{...owner,accountId});data={queued:true};
      }else if(write){
        const body=await request.json();
        data={job:await publish(pool(),{...owner,accountId:body.accountId,mediaType:body.mediaType,generationId:body.generationId,assetIds:body.assetIds,caption:body.caption,confirm:body.confirm,idempotencyKey:body.idempotencyKey})};
      }else data={jobs:await jobs(pool(),owner)};
      return Response.json(data,{status:write?202:200,headers:{'Cache-Control':'private,no-store'}});
    }catch(error){
      const status=error.status||(error.message==='Authentication required'?401:error.message==='Workspace access denied'?403:error instanceof SyntaxError?400:500);
      return Response.json({error:status>=500?'Instagram request failed. Check your connection and try again.':error.message},{status});
    }
  };
}
