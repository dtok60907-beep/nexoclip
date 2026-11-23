import { NxDirectorSkeleton } from '../../components/ui/nx-loading';

export default function DirectorLoading() {
  return (
    <div className="h-screen w-screen bg-[#fafafa]">
      <NxDirectorSkeleton variant="full" label="Loading AI Director" surface="light" />
    </div>
  );
}
