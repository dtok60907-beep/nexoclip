import { requireAdminPage } from '../../../src/lib/auth/adminPageAccess.js';
import ProductionQuotation from '../../../components/ProductionQuotation';
export const dynamic='force-dynamic';
export const metadata={title:'Production quotation | NexoClip Admin',robots:{index:false,follow:false}};
export default async function Page(){await requireAdminPage();return <ProductionQuotation/>;}
