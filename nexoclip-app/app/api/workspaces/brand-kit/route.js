import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
import { brandKitService } from '../../../../src/services/brandKitService.js';
import { requireCanSpend, resolveTenantContext } from '../../../../src/services/tenantContext.js';

export const dynamic = 'force-dynamic';

async function tenant(request) {
  const workspaceId = request.headers.get('x-workspace-id');
  if (!workspaceId) throw Object.assign(new Error('Workspace belum dipilih.'), { status: 400 });
  return resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
}

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
  if (status >= 500) console.error('Brand Kit request failed:', error.message);
  const message = status >= 500 ? 'Brand Kit gagal dimuat.' : error.message;
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
  try {
    const context = await tenant(request);
    return Response.json({ brandKit: await brandKitService().get(context.workspace.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: 'Origin tidak valid.' }, { status: 403 });
    const context = await tenant(request);
    if (!['owner', 'admin'].includes(context.workspace.role)) return Response.json({ error: 'Hanya owner atau admin workspace yang bisa mengubah Brand Kit.' }, { status: 403 });
    requireCanSpend(context);
    const body = await request.json().catch(() => ({}));
    const brandKit = await brandKitService().save({ workspaceId: context.workspace.id, userId: context.user.id, data: body.brandKit });
    return Response.json({ brandKit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
