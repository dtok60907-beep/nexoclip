import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { topupService } from '../../../../../src/services/topupService.js';

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

export async function GET(request, { params }) {
  try {
    const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
    if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
    const tenant = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
    const { topupId } = await params;
    const topup = await topupService().getTopup({ workspaceId: tenant.workspace.id, topupId });
    return NextResponse.json({ topup });
  } catch (error) { return errorResponse(error); }
}
