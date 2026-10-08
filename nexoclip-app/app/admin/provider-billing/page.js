import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import ProviderBillingDashboard from '../../../components/ProviderBillingDashboard';

export const metadata = { title: 'Billing provider | NexoClip Admin' };

export default async function Page({ searchParams }) {
  await requireAdminPage();
  const params = await searchParams || {};
  return <ProviderBillingDashboard initialJobScope={params.jobId !== undefined || params.workspaceId !== undefined ? {jobId:params.jobId,workspaceId:params.workspaceId} : null}/>;
}
