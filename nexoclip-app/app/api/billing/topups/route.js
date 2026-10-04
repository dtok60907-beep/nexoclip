import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { topupService } from '../../../../src/services/topupService.js';

async function context(request) {
  const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  return resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
}

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

// Behind Caddy, request.url is the internal address; use the forwarded host.
function publicOrigin(request) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function GET(request) {
  try {
    const tenant = await context(request);
    const service = topupService();
    return NextResponse.json({
      packages: service.listPackages(),
      topups: await service.listTopups({ workspaceId: tenant.workspace.id }),
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const tenant = await context(request);
    const body = await request.json().catch(() => ({}));
    const topup = await topupService().createTopup({
      workspaceId: tenant.workspace.id,
      userId: tenant.user.id,
      packageCode: body.packageCode,
      returnUrl: `${publicOrigin(request)}/studio/billing`,
    });
    return NextResponse.json({ topup }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
