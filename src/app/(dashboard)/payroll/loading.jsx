import { PageHeaderSkeleton, TableSkeleton } from '@/components/ui/skeletons';

/** Matches the payroll runs / payslips tables. */
export default function Loading() {
  return (
    <div className="p-6">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={6} />
    </div>
  );
}
