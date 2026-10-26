import { DirectorySkeleton } from '@/components/ui/skeletons';

/** Matches the employee directory: header + filter card + table shimmer. */
export default function Loading() {
  return (
    <div className="p-6">
      <DirectorySkeleton />
    </div>
  );
}
