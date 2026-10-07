import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE } from '../src/lib/auth/session.js';
import { getCurrentSession } from '../src/services/authService.js';
import { isPlatformOperator } from '../src/services/economicsService.js';
import AdminConsole from './AdminConsole';
export default async function AdminConsolePage({ section }) {
  const session = await getCurrentSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect('/login');
  if (!isPlatformOperator(session.user_id)) return <main className="min-h-screen bg-[#080809] p-8 text-white"><h1>Akses operator diperlukan</h1><Link href="/studio" className="mt-4 inline-block text-cyan-200">Kembali ke studio</Link></main>;
  const today = new Date();
  return <AdminConsole section={section} initialRange={{ from: new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }} />;
}
