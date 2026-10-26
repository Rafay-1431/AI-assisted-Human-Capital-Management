/**
 * Shimmer skeleton library (loading.jsx fallbacks).
 * Shapes mirror the REAL page layouts — KPI grids, chart cards and data
 * tables — so route transitions feel seamless instead of blank.
 */

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function KpiGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="mt-1 h-3 w-56" />
      <div className="mt-4 flex h-48 items-end gap-2 px-1">
        {[45, 70, 35, 85, 60, 75, 40, 90, 55, 65, 80, 50].map((h, i) => (
          <div key={i} className="skeleton flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex gap-4 border-b border-gray-200 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-40' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FilterCardSkeleton() {
  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-wrap items-end gap-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

/** Matches the role dashboards: header + KPI grid + chart pair. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiGridSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}

/** Matches the directory/boards: header + filters + table. */
export function DirectorySkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <FilterCardSkeleton />
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}
