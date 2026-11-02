import { NextResponse } from 'next/server.js';
import { verifyEmailToken } from '../../../../src/services/authService.js';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  const destination = new URL('/studio/home?auth=verified', request.url);
  if (!token) { destination.searchParams.set('auth', 'verify_error'); return NextResponse.redirect(destination); }
  try { await verifyEmailToken(token); } catch { destination.searchParams.set('auth', 'verify_error'); }
  return NextResponse.redirect(destination);
}
