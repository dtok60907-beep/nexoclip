import { NextResponse } from 'next/server.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../../../src/lib/auth/session.js';
import { isPlatformOperator } from '../../../../src/lib/auth/platformOperator.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { IMPERSONATION_COOKIE, OPERATOR_SESSION_COOKIE } from '../../../../src/lib/auth/impersonation.js';
import { IMPERSONATION_TTL_SECONDS, impersonationService } from '../../../../src/services/impersonationService.js';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export function createImpersonationHandlers({ sessionLookup = getCurrentSession, service = impersonationService, env = process.env } = {}) {
  const error = (e) => NextResponse.json({ error: e.status && e.status < 500 ? e.message : 'Impersonate tidak dapat diproses' }, { status: e.status || 500, headers });

  // Banner state: who is being viewed, and whether the operator can still return.
  async function GET(request) {
    // Operators: the impersonation history of one account.
    const historyOf = new URL(request.url).searchParams.get('history');
    if (historyOf) {
      try {
        const session = await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
        if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
        if (!isPlatformOperator(session.user_id, env) || session.impersonator_user_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
        return NextResponse.json({ history: await service.history(historyOf) }, { headers });
      } catch (e) {
        return error(e);
      }
    }
    const operatorToken = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
    if (!operatorToken) return NextResponse.json({ impersonating: false }, { headers });
    const session = await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
    const active = Boolean(session?.impersonator_user_id);
    return NextResponse.json({
      impersonating: true, active,
      ...(active ? { email: session.email, readOnly: session.impersonation_read_only !== false, expiresAt: session.expires_at } : {}),
    }, { headers });
  }

  async function POST(request) {
    try {
      if (!isSameOriginRequest(request, env)) return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403, headers });
      const operatorToken = request.cookies.get(SESSION_COOKIE)?.value;
      const operatorSession = await sessionLookup(operatorToken);
      if (!operatorSession) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
      const input = await request.json().catch(() => ({}));
      const result = await service.start({ operatorSession, targetUserId: input?.targetUserId, reason: input?.reason, readOnly: input?.readOnly !== false });
      const response = NextResponse.json({ target: result.target, readOnly: result.readOnly, redirectTo: '/studio' }, { headers });
      const options = sessionCookieOptions(request);
      response.cookies.set(OPERATOR_SESSION_COOKIE, operatorToken, { ...options, maxAge: 24 * 60 * 60 });
      response.cookies.set(SESSION_COOKIE, result.token, { ...options, maxAge: IMPERSONATION_TTL_SECONDS });
      response.cookies.set(IMPERSONATION_COOKIE, result.readOnly ? 'read-only' : 'act', { ...options, httpOnly: false, maxAge: IMPERSONATION_TTL_SECONDS });
      return response;
    } catch (e) {
      return error(e);
    }
  }

  // Leave: end the impersonation session and put the operator's own session back.
  async function DELETE(request) {
    try {
      if (!isSameOriginRequest(request, env)) return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403, headers });
      const operatorToken = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
      if (!operatorToken) return NextResponse.json({ error: 'Tidak sedang impersonate' }, { status: 409, headers });
      await service.stop(request.cookies.get(SESSION_COOKIE)?.value);
      const operatorSession = await sessionLookup(operatorToken);
      const response = NextResponse.json({ redirectTo: operatorSession ? '/admin/accounts' : '/login' }, { headers });
      const options = sessionCookieOptions(request);
      const remaining = operatorSession ? Math.floor((new Date(operatorSession.expires_at).getTime() - Date.now()) / 1000) : 0;
      response.cookies.set(SESSION_COOKIE, remaining > 0 ? operatorToken : '', { ...options, maxAge: Math.max(remaining, 0) });
      response.cookies.set(OPERATOR_SESSION_COOKIE, '', { ...options, maxAge: 0 });
      response.cookies.set(IMPERSONATION_COOKIE, '', { ...options, httpOnly: false, maxAge: 0 });
      return response;
    } catch (e) {
      return error(e);
    }
  }

  return { GET, POST, DELETE };
}

export const { GET, POST, DELETE } = createImpersonationHandlers();
