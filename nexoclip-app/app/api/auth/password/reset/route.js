import { NextResponse } from 'next/server.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { resetPassword } from '../../../../../src/services/authService.js';

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403 });
  try { const body = await request.json(); await resetPassword(body.token, body.password); return NextResponse.json({ reset: true }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
