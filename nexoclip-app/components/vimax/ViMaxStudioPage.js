'use client';

import './reused/styles.css';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AccountMenu from '../AccountMenu';
import { NxDirectorSkeleton } from '../ui/nx-loading';

const ViMaxApp = dynamic(() => import('./reused/ViMaxApp'), {
  ssr: false,
  loading: () => <NxDirectorSkeleton surface="dark" label="Loading AI Storyboard" />,
});

export default function ViMaxStudioPage() {
  return (
    <main className="min-h-screen bg-[#080809] text-white">
      <header className="flex h-14 items-center justify-between bg-transparent px-4 md:px-6">
        <Link href="/studio" className="text-sm font-medium text-white/70 transition hover:text-white">
          ← Back to Studio
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-white/35 sm:inline">Nexoclip</span>
          <AccountMenu />
        </div>
      </header>
      <div className="h-[calc(100vh-3.5rem)]">
        <ViMaxApp />
      </div>
    </main>
  );
}
