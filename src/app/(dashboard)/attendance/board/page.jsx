import { requireStaff } from '@/services/guard';
import { PageHeader, EmptyState, TableWrap, Th, Td, StatusBadge, Badge, btn } from '@/components/ui/primitives';
import ScanBadgeButton from '@/components/attendance/qr-scanner';

/** Daily attendance board (checklist 10) — staff only, filtered server-side. */
export default async function AttendanceBoardPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date : (await supabase.rpc('local_today')).data;
  const dept = sp.dept ?? 'all';

  let query = supabase
    .from('attendance')
    .select(
      'id, work_date, check_in_at, check_out_at, status, check_in_source, ' +
        'employee:employees(id, employee_code, department_id, department:departments!employees_department_id_fkey(name), user:profiles!employees_user_id_fkey(full_name))',
    )
    .eq('work_date', date)
    .order('check_in_at', { ascending: true, nullsFirst: false });

  const { data } = await query;
  const rows = (data ?? []).filter((r) => (dept !== 'all' ? r.employee?.department_id === dept : true));

  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const { data: departments } = await supabase.from('departments').select('id, name').order('name');

  return (
    <div>
      <PageHeader title="Daily attendance board" subtitle="Everyone who checked in / out on the selected day.">
        <ScanBadgeButton defaultMode="in" className={btn.ghost} />
      </PageHeader>

      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700" htmlFor="date">Date</label>
            <input id="date" name="date" type="date" defaultValue={date} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="w-48">
            <label className="text-sm font-medium text-gray-700" htmlFor="dept">Department</label>
            <select id="dept" name="dept" defaultValue={dept} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All departments</option>
              {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">Apply</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="gray">records: {rows.length}</Badge>
          <Badge tone="green">present: {counts.present ?? 0}</Badge>
          <Badge tone="amber">late: {counts.late ?? 0}</Badge>
          <Badge tone="amber">half day: {counts.half_day ?? 0}</Badge>
          <Badge tone="red">missing checkout: {counts.missing_checkout ?? 0}</Badge>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No attendance for this day" hint="Records appear the moment employees check in." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Employee</Th><Th>Code</Th><Th>Department</Th><Th>In</Th><Th>Out</Th><Th>Source</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{r.employee?.user?.full_name ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.employee?.employee_code}</Td>
                <Td>{r.employee?.department?.name ?? '—'}</Td>
                <Td>{r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                <Td>{r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                <Td className="text-gray-400">{r.check_in_source ?? '—'}</Td>
                <Td><StatusBadge value={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
