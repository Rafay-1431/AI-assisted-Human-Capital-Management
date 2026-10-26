import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/skeletons';

/** Matches the payslips table layout. */
export default function Loading() {
  return (
    <div className="p-6">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}
