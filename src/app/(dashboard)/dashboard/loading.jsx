import { DashboardSkeleton } from '@/components/ui/skeletons';

/** Matches the dashboard exactly: KPI cards + chart pair shimmer. */
export default function Loading() {
  return (
    <div className="p-6">
      <DashboardSkeleton />
    </div>
  );
}
