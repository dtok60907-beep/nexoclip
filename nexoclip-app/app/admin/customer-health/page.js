import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import CustomerHealthDashboard from '../../../components/CustomerHealthDashboard.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Customer health | NexoClip Admin', robots: { index: false, follow: false } };
export default async function Page() { await requireAdminPage(); return <CustomerHealthDashboard />; }
