import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../src/services/authService.js';
import { onboardingService } from '../../../src/services/onboardingService.js';

async function currentUserId(request) {
  const session = await getCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return session.user_id;
}

function errorResponse(error) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function GET(request) {
  try {
    return NextResponse.json(await onboardingService().get(await currentUserId(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const userId = await currentUserId(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await onboardingService().save(userId, body));
  } catch (error) { return errorResponse(error); }
}
