import { NxAccountSkeleton } from '../../components/ui/nx-loading';

export default function AccountLoading() {
  return (
    <main className="nx-content-page min-h-screen bg-[#fafafb] px-6 py-8">
      <div className="mx-auto max-w-[920px]">
        <NxAccountSkeleton />
      </div>
    </main>
  );
}
