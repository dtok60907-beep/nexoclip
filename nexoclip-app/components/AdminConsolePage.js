import { requireAdminPage } from '../src/lib/auth/adminPageAccess.js';
import AdminConsole from './AdminConsole';
export default async function AdminConsolePage({ section }) {
  await requireAdminPage();
  const today = new Date();
  return <AdminConsole section={section} initialRange={{ from: new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }} />;
}
