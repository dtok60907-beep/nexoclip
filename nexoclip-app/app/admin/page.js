import AdminConsolePage from '../../components/AdminConsolePage';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview | NexoClip Admin', robots: { index: false, follow: false } };
export default function Page() { return <AdminConsolePage section="overview" />; }
