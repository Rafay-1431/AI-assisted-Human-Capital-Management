import { DashboardSkeleton } from '@/components/ui/skeletons';

/**
 * Route-level fallback for EVERY authenticated page: shimmer skeleton shown
 * while the server component streams/loads, matching the dashboard layout.
 */
export default function Loading() {
  return (
    <div className="p-6">
      <DashboardSkeleton />
    </div>
  );
}
