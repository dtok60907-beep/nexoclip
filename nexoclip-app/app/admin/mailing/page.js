import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import MailingDashboard from '../../../components/MailingDashboard.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mailing & broadcast | NexoClip Admin', robots: { index: false, follow: false } };

export default async function Page() {
  await requireAdminPage();
  return <MailingDashboard />;
}
