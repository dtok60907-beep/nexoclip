import ProjectsDashboard from '../../../components/ProjectsDashboard';
import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Project & bagi hasil | NexoClip Admin', robots: { index: false, follow: false } };

export default async function Page() {
  await requireAdminPage();
  return <ProjectsDashboard />;
}
