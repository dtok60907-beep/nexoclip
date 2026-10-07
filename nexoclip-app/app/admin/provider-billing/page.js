import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import ProviderBillingDashboard from '../../../components/ProviderBillingDashboard';

export const metadata = { title: 'Billing provider | NexoClip Admin' };

export default async function Page() {
  await requireAdminPage();
  return <ProviderBillingDashboard/>;
}
