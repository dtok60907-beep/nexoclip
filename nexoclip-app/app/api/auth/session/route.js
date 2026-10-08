import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { isPlatformOperator } from '../../../../src/services/economicsService.js';

export function createSessionGetHandler({ sessionLookup = getCurrentSession, env = process.env } = {}) {
  return async function GET(request) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await sessionLookup(token);

    if (!session) return Response.json({ authenticated: false }, { headers: { 'Cache-Control': 'private, no-store' } });

    return Response.json({
      authenticated: true,
      user: {
        id: session.user_id,
        email: session.email,
        displayName: session.display_name,
        isPlatformOperator: isPlatformOperator(session.user_id, env),
      },
      sessionId: session.id,
      expiresAt: session.expires_at,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  };
}

export const GET = createSessionGetHandler();
