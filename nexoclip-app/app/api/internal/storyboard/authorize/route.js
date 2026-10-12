import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../../src/services/authService.js';

// Caddy `forward_auth` target for /storyboard. Caddy blocks /api/internal/* from
// the public internet and calls this directly on the app container, forwarding
// the browser's cookies. A 200 lets the request through to Jellyfish with the
// identity headers below; anything else is turned into a login redirect / 401.
export function createStoryboardAuthorizeHandler({ sessionLookup = getCurrentSession } = {}) {
  return async function GET(request) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await sessionLookup(token).catch(() => null) : null;
    if (!session?.user_id) {
      return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(null, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Nexoclip-User-Id': String(session.user_id),
        'X-Nexoclip-User-Email': encodeURIComponent(session.email || ''),
        'X-Nexoclip-User-Name': encodeURIComponent(session.display_name || ''),
      },
    });
  };
}

export const GET = createStoryboardAuthorizeHandler();
