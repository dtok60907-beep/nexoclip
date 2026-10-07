import { NextResponse } from 'next/server.js';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../../../../src/lib/auth/session.js';
import { loginUser } from '../../../../src/services/authService.js';
import { isPlatformOperator } from '../../../../src/services/economicsService.js';

export function createLoginPostHandler({ authenticate = loginUser, env = process.env } = {}) {
  return async function POST(request) {
    try {
      const result = await authenticate(await request.json());
      const operator = isPlatformOperator(result.user.id, env);
      const response = NextResponse.json({
        user: { ...result.user, isPlatformOperator: operator },
        redirectTo: operator ? '/admin/economics' : '/studio',
      }, { headers: { 'Cache-Control': 'private, no-store' } });
      response.cookies.set(SESSION_COOKIE, result.token, {
        ...sessionCookieOptions(request),
        maxAge: Math.floor((result.expiresAt.getTime() - Date.now()) / 1000),
      });
      return response;
    } catch {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
  };
}

export const POST = createLoginPostHandler();
