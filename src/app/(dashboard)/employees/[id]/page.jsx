import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card, StatusBadge, TableWrap, Th, Td, Badge, btn } from '@/components/ui/primitives';
import IdBadge from '@/components/employees/id-badge';

/**
 * Employee 360 (checklist 07): personal + job + compensation + attendance +
 * payslips in one view. RLS already scopes rows; an Employee can only reach
 * their own 360 (explicitly checked here too).
 */
export default async function Employee360Page({ params }) {
  const { id } = await params;
  const { profile, user, supabase } = await requireUser();

  const { data: employee } = await supabase
    .from('employees')
    .select(
      '*, department:departments!employees_department_id_fkey(name), designation:designations(title), user:profiles!employees_user_id_fkey(email, full_name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!employee) notFound();
  if (profile.role === 'employee' && employee.user_id !== user.id) notFound();

  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: attendance }, { data: payslips }] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, work_date, check_in_at, check_out_at, status')
      .eq('employee_id', id)
      .gte('work_date', since)
      .order('work_date', { ascending: false })
      .limit(15),
    supabase
      .from('payslips')
      .select('id, gross_salary, tax_amount, net_pay, run:payroll_runs(period_year, period_month, status)')
      .eq('employee_id', id)
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const statusCounts = {};
  for (const a of attendance ?? []) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.user?.full_name ?? employee.employee_code}
        subtitle={`${employee.employee_code} · ${employee.designation?.title ?? 'No designation'} · ${employee.department?.name ?? 'No department'}`}
      >
        <StatusBadge value={employee.employment_status} />
      </PageHeader>

      {/* Digital ID badge — QR encodes the employee code for entrance scanners */}
      <Card className="no-print">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-around">
          <IdBadge
            compact
            employeeCode={employee.employee_code}
            fullName={employee.user?.full_name ?? ''}
            designation={employee.designation?.title}
            department={employee.department?.name}
          />
          <div className="max-w-56 space-y-2 text-center sm:text-left">
            <p className="font-semibold text-gray-900">Digital ID badge</p>
            <p className="text-sm text-gray-500">
              HR can scan this QR at the entrance to mark attendance — the server stamps the time and applies the rules.
            </p>
            {profile.role === 'employee' ? (
              <Link href="/attendance/badge" className={btn.ghost + ' inline-block'}>Open print view</Link>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-gray-900">Personal</h2>
          <dl className="space-y-2 text-sm">
            {[['Email', employee.user?.email], ['Phone', employee.phone], ['Address', employee.address],
              ['Date of birth', employee.date_of_birth], ['Gender', employee.gender]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-gray-500">{k}</dt><dd className="text-right text-gray-900">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-gray-900">Job & compensation</h2>
          <dl className="space-y-2 text-sm">
            {[['Joined', employee.join_date], ['Exit date', employee.exit_date],
              ['Basic salary', Number(employee.basic_salary).toLocaleString()],
              ['Gross (1.5 × basic)', Number(employee.basic_salary * 1.5).toLocaleString()]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-gray-500">{k}</dt><dd className="text-right text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-gray-900">Attendance — last 30 days</h2>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="green">present: {statusCounts.present ?? 0}</Badge>
          <Badge tone="amber">late: {statusCounts.late ?? 0}</Badge>
          <Badge tone="amber">half day: {statusCounts.half_day ?? 0}</Badge>
          <Badge tone="red">missing checkout: {statusCounts.missing_checkout ?? 0}</Badge>
        </div>
        {attendance?.length ? (
          <TableWrap>
            <thead><tr><Th>Date</Th><Th>Check in</Th><Th>Check out</Th><Th>Status</Th></tr></thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id}>
                  <Td>{a.work_date}</Td>
                  <Td>{a.check_in_at ? new Date(a.check_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                  <Td>{a.check_out_at ? new Date(a.check_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</Td>
                  <Td><StatusBadge value={a.status} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Card>No attendance recorded in the last 30 days.</Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-gray-900">Payslips</h2>
        {payslips?.length ? (
          <TableWrap>
            <thead><tr><Th>Period</Th><Th>Status</Th><Th>Gross</Th><Th>Tax</Th><Th>Net</Th><Th /></tr></thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <Td>{p.run?.period_month}/{p.run?.period_year}</Td>
                  <Td><StatusBadge value={p.run?.status} /></Td>
                  <Td>{Number(p.gross_salary).toLocaleString()}</Td>
                  <Td>{Number(p.tax_amount).toLocaleString()}</Td>
                  <Td className="font-semibold">{Number(p.net_pay).toLocaleString()}</Td>
                  <Td className="text-right"><a href={`/api/payslips/${p.id}/pdf`} className={btn.small} target="_blank">PDF</a></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Card>No payslips yet — payroll has not run.</Card>
        )}
      </div>

      <Link href="/employees" className={btn.ghost}>← Back to directory</Link>
    </div>
  );
}
