import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import UsageAnalytics from '../../../components/UsageAnalytics.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics pemakaian | NexoClip Admin', robots: { index: false, follow: false } };
export default async function AnalyticsPage() {
  await requireAdminPage();
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
  return <UsageAnalytics initialRange={{ from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }} />;
}
