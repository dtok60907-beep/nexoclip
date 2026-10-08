import LoginForm from '../../../components/saas/LoginForm.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../src/services/authService.js';
import { isPlatformOperator } from '../../../src/services/economicsService.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in | Nexoclip',
  description: 'Sign in to your Nexoclip workspace.',
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const session = await getCurrentSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session && isPlatformOperator(session.user_id)) redirect('/admin/economics');
  return <LoginForm />;
}
