import { NextResponse } from 'next/server.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { requestPasswordReset } from '../../../../../src/services/authService.js';

export async function POST(request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  await requestPasswordReset(body.email);
  return NextResponse.json({ sent: true, message: 'Jika email terdaftar, link reset password sudah dikirim.' });
}
