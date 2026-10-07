import { requireAdminPage } from '../src/lib/auth/adminPageAccess.js';
import BackofficeDashboard from './BackofficeDashboard';
export default async function BackofficePage({mode}) {
 await requireAdminPage();
 return <BackofficeDashboard mode={mode}/>;
}
