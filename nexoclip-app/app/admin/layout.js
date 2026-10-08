import './admin.css';
import { requireAdminPage } from '../../src/lib/auth/adminPageAccess.js';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  await requireAdminPage();
  return children;
}
