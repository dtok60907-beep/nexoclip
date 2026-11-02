import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { getCurrentSession, changePassword } from '../../../../../src/services/authService.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403 });
  const session = await getCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try { const body = await request.json(); await changePassword(session.user_id, body.currentPassword, body.password); return NextResponse.json({ changed: true }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
