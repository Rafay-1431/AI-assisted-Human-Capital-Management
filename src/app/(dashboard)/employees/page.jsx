import Link from 'next/link';
import { requireUser } from '@/services/guard';
import { listEmployeesAction } from '@/actions/employee-actions';
import { PageHeader, Card, EmptyState, TableWrap, Th, Td, StatusBadge, btn } from '@/components/ui/primitives';

/**
 * Employee directory (checklist 07). Search/filters/paging are SERVER-side
 * via URL params (shareable). For an Employee the RLS-scoped query naturally
 * returns only their own row, so the same screen doubles as "my profile".
 */
export default async function EmployeesDirectoryPage({ searchParams }) {
  const sp = await searchParams;
  const { profile, supabase } = await requireUser();

  const page = Math.max(1, Number(sp.page) || 1);
  const result = await listEmployeesAction({
    search: sp.q ?? '',
    departmentId: sp.dept ?? 'all',
    status: sp.status ?? 'all',
    page,
    pageSize: 10,
  });

  const { data: departments } = await supabase.from('departments').select('id, name').order('name');
  const total = result?.ok ? result.total : 0;
  const rows = result?.ok ? result.rows : [];
  const pageCount = Math.max(1, Math.ceil(total / 10));

  const pageLink = (p) => {
    const params = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.dept && sp.dept !== 'all' ? { dept: sp.dept } : {}), ...(sp.status && sp.status !== 'all' ? { status: sp.status } : {}), ...(p > 1 ? { page: String(p) } : {}) });
    return `/employees?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Employee directory" subtitle={`${total} employee${total === 1 ? '' : 's'} — search, filter and open a 360 profile.`}>
        {profile.role === 'hr' ? (
          <>
            <Link href="/employees/import" className={btn.ghost}>CSV import</Link>
            <Link href="/employees/new" className={btn.primary}>Register employee</Link>
          </>
        ) : null}
      </PageHeader>

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="q">Search</label>
            <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Name, code or email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="w-44">
            <label className="text-sm font-medium text-gray-700" htmlFor="dept">Department</label>
            <select id="dept" name="dept" defaultValue={sp.dept ?? 'all'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All departments</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="w-36">
            <label className="text-sm font-medium text-gray-700" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={sp.status ?? 'all'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All</option><option value="probation">Probation</option><option value="active">Active</option><option value="exited">Exited</option>
            </select>
          </div>
          <button type="submit" className={btn.primary}>Apply</button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No employees found" hint="Register an employee or import a CSV to get started." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr><Th>Code</Th><Th>Name</Th><Th>Department</Th><Th>Designation</Th><Th>Status</Th><Th>Joined</Th><Th>Basic salary</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <Td className="font-mono text-xs">{e.employee_code}</Td>
                  <Td className="font-medium text-gray-900">{e.full_name}</Td>
                  <Td>{e.department ?? '—'}</Td>
                  <Td>{e.designation ?? '—'}</Td>
                  <Td><StatusBadge value={e.employment_status} /></Td>
                  <Td>{e.join_date}</Td>
                  <Td>{Number(e.basic_salary).toLocaleString()}</Td>
                  <Td className="text-right"><Link href={`/employees/${e.id}`} className={btn.small}>360</Link></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                {page > 1 ? <Link href={pageLink(page - 1)} className={btn.ghost}>Previous</Link> : null}
                {page < pageCount ? <Link href={pageLink(page + 1)} className={btn.ghost}>Next</Link> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
