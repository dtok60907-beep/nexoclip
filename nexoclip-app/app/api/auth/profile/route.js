import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession, updateUserProfile } from '../../../../src/services/authService.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';

export async function PATCH(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const session = await getCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const user = await updateUserProfile(session.user_id, { displayName: body?.displayName });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not update profile.' },
      { status: error.status || 400 },
    );
  }
}
