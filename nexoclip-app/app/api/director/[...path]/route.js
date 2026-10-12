// Reverse proxy to the AI Director service (services/OpenMontage/director_service).
// The browser only ever talks to this route: it authenticates the nexoclip
// session, then forwards /api/director/* to the service with the verified user
// id and the shared proxy secret. The service itself is never exposed publicly.
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-disposition', 'cache-control', 'x-accel-buffering', 'last-modified', 'etag'];

export function createDirectorProxyHandler({
  getSession = getCurrentSession,
  fetchFn = fetch,
  env = process.env,
} = {}) {
  return async function proxy(request, ctx) {
    const serviceUrl = (env.DIRECTOR_SERVICE_URL || '').replace(/\/+$/, '');
    if (!serviceUrl) return Response.json({ error: 'AI Director belum dikonfigurasi.' }, { status: 503 });

    const session = await getSession(request.cookies?.get(SESSION_COOKIE)?.value).catch(() => null);
    if (!session?.user_id) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const { path = [] } = await ctx.params;
    if (!path.length || !path.every((segment) => SEGMENT.test(segment) && segment !== '..' && segment !== '.')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const search = new URL(request.url).search;
    const headers = {
      'X-Nexoclip-User-Id': String(session.user_id),
      Accept: request.headers.get('accept') || '*/*',
    };
    if (env.DIRECTOR_PROXY_SECRET) headers['X-Director-Proxy-Secret'] = env.DIRECTOR_PROXY_SECRET;
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
      headers['Content-Type'] = request.headers.get('content-type') || 'application/json';
    }

    let upstream;
    try {
      upstream = await fetchFn(`${serviceUrl}/api/director/${path.join('/')}${search}`, {
        method: request.method,
        headers,
        body,
        signal: request.signal,
        cache: 'no-store',
      });
    } catch {
      return Response.json({ error: 'AI Director sedang tidak bisa dihubungi.' }, { status: 502 });
    }

    const responseHeaders = new Headers();
    for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has('cache-control')) responseHeaders.set('cache-control', 'private, no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

const proxy = createDirectorProxyHandler();
export const GET = proxy;
export const POST = proxy;
