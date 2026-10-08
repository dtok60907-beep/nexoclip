import { randomUUID } from 'node:crypto';

import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { signCanvasAuthorization } from '../../../../src/lib/realtime/internalAuth.js';
import { issueRealtimeToken } from '../../../../src/lib/realtime/token.js';
import { getCurrentSession } from '../../../../src/services/authService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPresent(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasRealtimeConfig(env) {
  return isPresent(env?.CANVAS_AUTH_URL) && isPresent(env?.CANVAS_AUTH_SECRET) && isPresent(env?.REALTIME_TOKEN_SECRET);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createRealtimeTokenHandler({
  getSession = getCurrentSession,
  fetchFn = globalThis.fetch,
  env = process.env,
  now = () => Math.floor(Date.now() / 1000),
  createNonce = () => randomUUID(),
  signAuthorization = signCanvasAuthorization,
  issueToken = issueRealtimeToken,
} = {}) {
  return async function POST(request) {
    let session;
    try {
      session = await getSession(request.cookies?.get(SESSION_COOKIE)?.value);
    } catch {
      return Response.json({ error: 'Realtime authorization failed' }, { status: 502 });
    }
    if (!session?.user_id || !UUID_PATTERN.test(String(session.id || ''))) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await readBody(request);
    const projectId = body?.projectId;

    if (!UUID_PATTERN.test(String(projectId || ''))) {
      return Response.json({ error: 'projectId must be a valid UUID' }, { status: 400 });
    }

    if (!hasRealtimeConfig(env)) {
      return Response.json({ error: 'Realtime authorization is unavailable' }, { status: 503 });
    }

    const payload = {
      userId: session.user_id,
      projectId,
      timestamp: now(),
      nonce: createNonce(),
    };

    let signature;
    try {
      signature = signAuthorization(payload, env.CANVAS_AUTH_SECRET);
    } catch {
      return Response.json({ error: 'Realtime authorization failed' }, { status: 502 });
    }

    let authResponse;
    try {
      authResponse = await fetchFn(env.CANVAS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, signature }),
      });
    } catch {
      return Response.json({ error: 'Realtime authorization failed' }, { status: 502 });
    }

    if (authResponse.status === 403) {
      return Response.json({ error: 'Realtime authorization denied' }, { status: 403 });
    }

    if (!authResponse.ok) {
      return Response.json({ error: 'Realtime authorization failed' }, { status: 502 });
    }

    let authorization;
    try {
      authorization = await authResponse.json();
    } catch {
      return Response.json({ error: 'Realtime authorization failed' }, { status: 502 });
    }

    if (authorization?.authorized !== true) {
      return Response.json({ error: 'Realtime authorization denied' }, { status: 403 });
    }

    let issued;
    try {
      issued = await issueToken({ userId: session.user_id, projectId, sessionId: session.id }, env.REALTIME_TOKEN_SECRET);
    } catch {
      return Response.json({ error: 'Realtime token issuance failed' }, { status: 500 });
    }
    return Response.json({ token: issued.token, expiresAt: issued.expiresAt });
  };
}

export const POST = createRealtimeTokenHandler();
