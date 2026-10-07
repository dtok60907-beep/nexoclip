import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../src/services/authService.js';
import { isPlatformOperator } from '../../../src/services/economicsService.js';
import EconomicsDashboard from '../../../components/EconomicsDashboard.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'COGS & kontribusi | Nexoclip', robots: { index: false, follow: false } };
export default async function EconomicsPage() {
  const cookieStore = await cookies();
  const session = await getCurrentSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/login');
  if (!isPlatformOperator(session.user_id)) return <main className="min-h-screen bg-[#080809] p-8 text-white"><h1 className="text-xl font-semibold">Akses operator diperlukan</h1><p className="mt-2 text-sm text-white/50">Laporan biaya internal hanya tersedia untuk operator platform.</p><Link className="mt-5 inline-block text-cyan-300" href="/studio">Kembali ke studio</Link></main>;
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
  return <EconomicsDashboard initialRange={{ from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }} />;
}
