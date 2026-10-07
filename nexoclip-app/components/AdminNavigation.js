import Link from 'next/link';
export const adminLinks = [['/admin', 'Overview'], ['/admin/customers', 'Customers'], ['/admin/accounts', 'Accounts'], ['/admin/billing', 'Business billing'], ['/admin/provider-billing', 'Billing provider'], ['/admin/transactions', 'Transactions'], ['/admin/credits', 'Credits'], ['/admin/jobs', 'Jobs'], ['/admin/economics', 'Economics'], ['/admin/models', 'Model & tarif']];
const groups = [
 { label: 'Workspace', paths: ['/admin','/admin/customers','/admin/accounts'] },
 { label: 'Billing & credits', paths: ['/admin/billing','/admin/provider-billing','/admin/transactions','/admin/credits'] },
 { label: 'Operasional', paths: ['/admin/jobs','/admin/economics','/admin/models'] },
];
const icons = {
 '/admin': 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 '/admin/customers': 'M3 21V7h18v14 M9 7V3h6v4 M7 11h2 M15 11h2 M7 15h2 M15 15h2 M10 21v-3h4v3',
 '/admin/accounts': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0',
 '/admin/billing': 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h3',
 '/admin/provider-billing': 'M4 3h12v5 M4 3v18h16V8h-4V3 M8 11h8 M8 15h3 M14 18l2 2 4-4',
 '/admin/transactions': 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
 '/admin/credits': 'M3 5h18v14H3z M3 9h18 M7 15h3',
 '/admin/jobs': 'M9 3h6v4H9z M7 5H4v16h16V5h-3 M8 11h8 M8 15h5',
 '/admin/economics': 'M3 3v18h18 M7 15l4-5 4 3 5-8',
 '/admin/models': 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
};
export default function AdminNavigation({ active, onNavigate, mobile = false }) {
 return <nav aria-label={mobile ? 'Admin navigation mobile' : 'Admin navigation'} className="space-y-6 text-sm">
  {groups.map(group => <section key={group.label}><h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-white/35">{group.label}</h2><div className="space-y-1">{adminLinks.filter(([href])=>group.paths.includes(href)).map(([href,label])=><Link key={href} href={href} onClick={onNavigate} aria-current={active===href?'page':undefined} className={`flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active===href?'border-cyan-300/20 bg-cyan-300/10 text-cyan-200':'border-transparent text-white/55 hover:bg-white/5 hover:text-white'}`}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icons[href]}/></svg><span>{label}</span></Link>)}</div></section>)}
 </nav>;
}
