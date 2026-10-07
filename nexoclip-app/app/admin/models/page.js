import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import ModelRatesDashboard from '../../../components/ModelRatesDashboard';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Model & tarif | NexoClip Admin', robots: { index: false, follow: false } };
export default async function Page() {
  await requireAdminPage();
  return <ModelRatesDashboard />;
}
