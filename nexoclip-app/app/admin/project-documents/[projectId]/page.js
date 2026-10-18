import ProjectDocument, { PROJECT_DOCUMENTS } from '../../../../components/ProjectDocument';
import { requireAdminPage } from '../../../../src/lib/auth/adminPageAccess.js';
import { revenueShareService } from '../../../../src/services/revenueShareService.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dokumen project | NexoClip Admin', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }) {
  const session = await requireAdminPage();
  const { projectId } = await params;
  const { doc } = await searchParams;
  const type = PROJECT_DOCUMENTS[doc] ? doc : 'statement';
  try {
    return <ProjectDocument type={type} data={await revenueShareService.documentData(session.user_id, projectId)} />;
  } catch (error) {
    return <p style={{ padding: 24 }}>{error.status && error.status < 500 ? error.message : 'Dokumen tidak dapat dibuat'}</p>;
  }
}
