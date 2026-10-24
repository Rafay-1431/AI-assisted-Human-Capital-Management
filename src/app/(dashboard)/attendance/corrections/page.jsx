import { requireUser } from '@/services/guard';
import { PageHeader, EmptyState, TableWrap, Th, Td, StatusBadge } from '@/components/ui/primitives';
import CorrectionForm from './correction-form';
import ReviewButtons from './review-buttons';

/** Checklist 11 — Employee requests with a reason; HR/Admin approve or reject. */
export default async function CorrectionsPage() {
  const { profile, supabase } = await requireUser();
  const isStaff = profile.role === 'admin' || profile.role === 'hr';

  let myRequests = [];
  let queue = [];

  if (isStaff) {
    const { data } = await supabase
      .from('attendance_corrections')
      .select(
        '*, employee:employees(employee_code, user:profiles!employees_user_id_fkey(full_name))',
      )
      .order('created_at', { ascending: false })
      .limit(50);
    queue = data ?? [];
  } else {
    const { data } = await supabase
      .from('attendance_corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    myRequests = data ?? [];
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { hour12: false }).slice(0, 17) : '—');

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Attendance corrections"
        subtitle={
          isStaff
            ? 'Approving applies the corrected times and recomputes the attendance status automatically.'
            : 'Made a mistake checking in? Request a correction with a reason — HR will review it.'
        }
      />

      {!isStaff ? (
        <CorrectionForm />
      ) : null}

      {isStaff ? (
        <div>
          <h2 className="mb-3 font-semibold text-gray-900">Review queue</h2>
          {queue.length === 0 ? (
            <EmptyState title="No correction requests" hint="Employee requests appear here for review." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Employee</Th><Th>Date</Th><Th>Requested in</Th><Th>Requested out</Th><Th>Reason</Th><Th>Status</Th><Th>Review</Th></tr></thead>
              <tbody>
                {queue.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-gray-900">{c.employee?.user?.full_name ?? '—'}</Td>
                    <Td>{c.work_date}</Td>
                    <Td>{fmt(c.requested_check_in)}</Td>
                    <Td>{fmt(c.requested_check_out)}</Td>
                    <Td className="max-w-56 truncate text-gray-600">{c.reason}</Td>
                    <Td><StatusBadge value={c.status} /></Td>
                    <Td>{c.status === 'pending' ? <ReviewButtons correctionId={c.id} /> : <span className="text-xs text-gray-400">{c.review_comment ?? ''}</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      ) : (
        <div>
          <h2 className="mb-3 font-semibold text-gray-900">My requests</h2>
          {myRequests.length === 0 ? (
            <EmptyState title="No requests yet" hint="Submit one above if a check-in/out needs fixing." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Date</Th><Th>Reason</Th><Th>HR comment</Th><Th>Status</Th></tr></thead>
              <tbody>
                {myRequests.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.work_date}</Td>
                    <Td className="max-w-56 truncate text-gray-600">{c.reason}</Td>
                    <Td className="max-w-56 truncate text-gray-600">{c.review_comment ?? '—'}</Td>
                    <Td><StatusBadge value={c.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
    </div>
  );
}
