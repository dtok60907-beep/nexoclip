import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import EconomicsDashboard from '../../../components/EconomicsDashboard.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'COGS & kontribusi | Nexoclip', robots: { index: false, follow: false } };
export default async function EconomicsPage() {
  await requireAdminPage();
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
  return <EconomicsDashboard initialRange={{ from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }} />;
}
