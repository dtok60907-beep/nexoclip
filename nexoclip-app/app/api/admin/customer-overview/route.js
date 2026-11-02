import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { requirePlatformOperator } from '../../../../src/lib/auth/platformOperator.js';
import { adminCustomerOverviewService } from '../../../../src/services/adminCustomerOverviewService.js';

export async function GET(request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    const session = await getCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    requirePlatformOperator(session.user_id);
    const url = new URL(request.url);
    return Response.json(await adminCustomerOverviewService.list({ userId: session.user_id, days: url.searchParams.get('days') || 30, query: url.searchParams.get('q') || '' }), { headers });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: status >= 500 ? 'Customer overview unavailable' : error.message }, { status, headers });
  }
}
