import { cache } from 'react';
import { cookies } from 'next/headers.js';
import { redirect } from 'next/navigation.js';
import { SESSION_COOKIE } from './session.js';
import { isPlatformOperator } from './platformOperator.js';
import { getCurrentSession } from '../../services/authService.js';

export function createAdminPageGuard({ cookieStore = cookies, sessionLookup = getCurrentSession, redirectTo = redirect, env = process.env } = {}) {
  return async function requireAdminPage() {
    const session = await sessionLookup((await cookieStore()).get(SESSION_COOKIE)?.value);
    if (!session) return redirectTo('/login');
    if (!isPlatformOperator(session.user_id, env)) return redirectTo('/studio');
    return session;
  };
}

// Memoization is scoped to this server render. Both layouts and page entry
// points check access, including partial navigation and direct RSC requests.
export const requireAdminPage = cache(createAdminPageGuard());
