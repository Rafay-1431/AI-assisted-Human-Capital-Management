import Link from 'next/link';
import { requireEmployee } from '@/services/guard';
import { PageHeader, Card, EmptyState, TableWrap, Th, Td, StatusBadge, Badge, btn } from '@/components/ui/primitives';
import AttendanceWidget from './attendance-widget';

/** Employee self-service: check-in widget, own calendar, own corrections. */
export default async function MyAttendancePage() {
  const { employeeId, supabase } = await requireEmployee();

  const [{ data: records }, { data: corrections }] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, work_date, check_in_at, check_out_at, status, check_in_source')
      .eq('employee_id', employeeId)
      .order('work_date', { ascending: false })
      .limit(30),
    supabase
      .from('attendance_corrections')
      .select('id, work_date, status, reason, review_comment')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const hours = (records ?? []).reduce(
    (sum, r) => sum + (r.check_in_at && r.check_out_at ? (new Date(r.check_out_at) - new Date(r.check_in_at)) / 3600000 : 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="My attendance" subtitle="Server-stamped times — check in and out from any browser." />

      <AttendanceWidget />

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="teal">Last 30 records · {Number(hours.toFixed(1))} h tracked</Badge>
        <Link href="/attendance/badge" className="text-xs font-semibold text-teal-700 underline">View my ID badge</Link>
      </div>

      {records?.length ? (
        <TableWrap>
          <thead><tr><Th>Date</Th><Th>In</Th><Th>Out</Th><Th>Source</Th><Th>Status</Th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium text-gray-900">{r.work_date}</Td>
                <Td>{r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                <Td>{r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                <Td className="text-gray-400">{r.check_in_source ?? '—'}</Td>
                <Td><StatusBadge value={r.status} /></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState title="No attendance yet" hint="Use Check in above — your calendar fills up as you work." />
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">My correction requests</h2>
          <Link href="/attendance/corrections" className={btn.ghost}>Request a correction</Link>
        </div>
        {corrections?.length ? (
          <TableWrap>
            <thead><tr><Th>Date</Th><Th>Reason</Th><Th>HR comment</Th><Th>Status</Th></tr></thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id}>
                  <Td>{c.work_date}</Td>
                  <Td className="max-w-64 truncate text-gray-600">{c.reason}</Td>
                  <Td className="max-w-64 truncate text-gray-600">{c.review_comment ?? '—'}</Td>
                  <Td><StatusBadge value={c.status} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Card>Nothing to correct — nice.</Card>
        )}
      </div>
    </div>
  );
}
