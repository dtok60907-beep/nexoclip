import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { requireCanSpend, resolveTenantContext } from '../../../../src/services/tenantContext.js';
import { subscriptionService } from '../../../../src/services/subscriptionService.js';

async function context(request) {
  const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id');
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  return resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
}

function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 400);
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

function publicOrigin(request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return forwardedHost ? `${proto}://${forwardedHost}` : new URL(request.url).origin;
}

// Plans, the workspace's subscription and its recent payments.
export async function GET(request) {
  try {
    const tenant = await context(request);
    return NextResponse.json(await subscriptionService().overview({ workspaceId: tenant.workspace.id }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

// Starts a Pakasir payment for one period of a plan.
export async function POST(request) {
  try {
    const tenant = await context(request);
    requireCanSpend(tenant);
    const body = await request.json().catch(() => ({}));
    const order = await subscriptionService().createOrder({
      workspaceId: tenant.workspace.id, userId: tenant.user.id, planCode: body.planCode,
      returnUrl: `${publicOrigin(request)}/studio/billing`,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
