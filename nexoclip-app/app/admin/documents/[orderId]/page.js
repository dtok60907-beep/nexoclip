import BusinessDocument from '../../../../components/BusinessDocument';
import { requireAdminPage } from '../../../../src/lib/auth/adminPageAccess.js';
import { businessDocumentsService } from '../../../../src/services/businessDocumentsService.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dokumen | NexoClip Admin', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }) {
  const session = await requireAdminPage();
  const { orderId } = await params;
  const { doc } = await searchParams;
  try {
    const data = await businessDocumentsService.documentData(session.user_id, orderId, doc || 'quotation');
    return <BusinessDocument data={data} />;
  } catch (error) {
    return <p style={{ padding: 24 }}>{error.status && error.status < 500 ? error.message : 'Dokumen tidak dapat dibuat'}</p>;
  }
}
