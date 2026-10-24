import { notFound } from 'next/navigation';
import { requireStaff } from '@/services/guard';
import { PageHeader, TableWrap, Th, Td, StatusBadge } from '@/components/ui/primitives';
import FinalizeButton from './finalize-button';

/** Run detail: computed payslips + Admin-only finalize (locks the month). */
export default async function PayrollRunDetailPage({ params }) {
  const { id } = await params;
  const { profile, supabase } = await requireStaff();

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle();
  if (!run) notFound();

  const { data: payslips } = await supabase
    .from('payslips')
    .select('id, gross_salary, absent_deduction, half_day_deduction, tax_amount, net_pay, employee:employees(employee_code, user:profiles!employees_user_id_fkey(full_name))')
    .eq('payroll_run_id', id)
    .order('employee_code', { ascending: true, foreignTable: 'employees' });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payroll ${run.period_month}/${run.period_year}`}
        subtitle={`Working days: ${run.working_days} · Employees: ${run.employee_count}`}
      >
        <StatusBadge value={run.status} />
        {run.status === 'draft' && profile.role === 'admin' ? <FinalizeButton runId={run.id} /> : null}
      </PageHeader>

      {run.status === 'finalized' ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Finalized by Admin on {run.finalized_at ? new Date(run.finalized_at).toLocaleString('en-GB') : '—'} — this run is permanently locked.
        </p>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Draft — employees have been notified that payslips are ready, but the month is only locked once Admin finalizes.
        </p>
      )}

      <TableWrap>
        <thead>
          <tr><Th>Employee</Th><Th>Gross</Th><Th>Absent ded.</Th><Th>Half-day ded.</Th><Th>Tax</Th><Th>Net pay</Th><Th>Payslip</Th></tr>
        </thead>
        <tbody>
          {(payslips ?? []).map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-gray-900">
                {p.employee?.user?.full_name ?? '—'} <span className="font-mono text-xs text-gray-400">{p.employee?.employee_code}</span>
              </Td>
              <Td>{Number(p.gross_salary).toLocaleString()}</Td>
              <Td>{Number(p.absent_deduction).toLocaleString()}</Td>
              <Td>{Number(p.half_day_deduction).toLocaleString()}</Td>
              <Td className="text-red-600">{Number(p.tax_amount).toLocaleString()}</Td>
              <Td className="font-semibold">{Number(p.net_pay).toLocaleString()}</Td>
              <Td><a href={`/api/payslips/${p.id}/pdf`} target="_blank" className="text-xs font-semibold text-teal-700 underline">PDF</a></Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <Td>Totals</Td>
            <Td>{Number(run.total_gross).toLocaleString()}</Td>
            <Td colSpan={2}>{Number(run.total_deductions).toLocaleString()}</Td>
            <Td className="text-red-600">{Number(run.total_tax).toLocaleString()}</Td>
            <Td>{Number(run.total_net).toLocaleString()}</Td>
            <Td />
          </tr>
        </tfoot>
      </TableWrap>
    </div>
  );
}
