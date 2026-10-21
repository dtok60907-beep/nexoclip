import { NextResponse } from 'next/server';
import { createSessionToken, sessionCookieOptions } from '../../../../src/lib/auth/session.js';
import { publicAppOrigin } from '../../../../src/lib/auth/sameOrigin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Kicks off Google OAuth: redirect the user to Google's consent screen.
export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  // Behind the proxy request.nextUrl carries the internal address (0.0.0.0:8080).
  const origin = process.env.GOOGLE_OAUTH_ORIGIN || publicAppOrigin(request);
  if (!clientId) {
    const loginUrl = new URL('/studio/home?auth=login', origin);
    loginUrl.searchParams.set('error', 'google_unconfigured');
    return NextResponse.redirect(loginUrl);
  }

  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = createSessionToken();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  // CSRF guard — verified in the callback. Lax so it survives Google's redirect back.
  response.cookies.set('g_oauth_state', state, {
    ...sessionCookieOptions(request),
    maxAge: 600,
  });
  return response;
}
