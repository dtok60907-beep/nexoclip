import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '../../../../../src/lib/auth/session.js';
import { loginWithGoogle } from '../../../../../src/services/authService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeJwtPayload(idToken) {
  const part = String(idToken || '').split('.')[1] || '';
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

export async function GET(request) {
  const url = request.nextUrl;
  const loginUrl = new URL('/login', url.origin);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.cookies.get('g_oauth_state')?.value;

  if (url.searchParams.get('error')) {
    loginUrl.searchParams.set('error', 'google');
    return NextResponse.redirect(loginUrl);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    loginUrl.searchParams.set('error', 'google_state');
    return NextResponse.redirect(loginUrl);
  }

  const origin = process.env.GOOGLE_OAUTH_ORIGIN || url.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');
    const tokens = await tokenResponse.json();

    const profile = decodeJwtPayload(tokens.id_token);
    const email = profile.email;
    if (!email || profile.email_verified === false) throw new Error('Email not available or unverified');
    const displayName = profile.name || profile.given_name || null;

    const { token, expiresAt, isNew } = await loginWithGoogle({ email, displayName });

    // First sign-in creates the account, so it continues into onboarding.
    const response = NextResponse.redirect(new URL(isNew ? '/onboarding' : '/studio', url.origin));
    response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(request), expires: new Date(expiresAt) });
    response.cookies.set('g_oauth_state', '', { path: '/', maxAge: 0 });
    return response;
  } catch {
    loginUrl.searchParams.set('error', 'google');
    return NextResponse.redirect(loginUrl);
  }
}
