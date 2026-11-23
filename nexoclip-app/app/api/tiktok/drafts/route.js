import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext, requireCanSpend } from '../../../../src/services/tenantContext.js';
import { getPool } from '../../../../src/db/pool.js';
import { listSocialPublishDrafts, getSocialPublishDraft, saveSocialPublishDraft, deleteSocialPublishDraft } from '../../../../src/services/socialPublishDrafts.mjs';

export const runtime = 'nodejs';
async function handle(request) {
  try {
    if (request.method !== 'GET' && !isSameOriginRequest(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
    const tenant = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId: request.headers.get('x-workspace-id') });
    const owner = { workspaceId: tenant.workspace.id, userId: tenant.user.id }, pool = getPool();
    let data;
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      data = id ? { draft: await getSocialPublishDraft(pool, owner, id) } : { drafts: await listSocialPublishDrafts(pool, owner) };
    } else {
      requireCanSpend(tenant);
      const body = await request.json();
      if (request.method === 'DELETE') { await deleteSocialPublishDraft(pool, owner, body.id, body.version); data = { deleted: true }; }
      else data = { draft: await saveSocialPublishDraft(pool, owner, body) };
    }
    return Response.json(data, { headers: { 'Cache-Control': 'private,no-store' } });
  } catch (error) {
    const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
    return Response.json({ error: status >= 500 ? 'Publishing drafts unavailable' : error.message }, { status });
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
