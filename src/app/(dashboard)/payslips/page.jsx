import { requireUser } from '@/services/guard';
import { PageHeader, EmptyState, TableWrap, Th, Td, StatusBadge, Badge } from '@/components/ui/primitives';

/** Payslips (checklist 17): employees see their own; staff see everyone's. */
export default async function PayslipsPage() {
  const { profile, supabase } = await requireUser();
  const isStaff = profile.role === 'admin' || profile.role === 'hr';

  let query = supabase
    .from('payslips')
    .select(
      'id, gross_salary, absent_deduction, half_day_deduction, tax_amount, net_pay, ' +
        'run:payroll_runs(period_year, period_month, status), ' +
        'employee:employees(employee_code, user:profiles!employees_user_id_fkey(full_name))',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (!isStaff) query = query.eq('employee_id', (await supabase.from('employees').select('id').eq('user_id', profile.id).single()).data?.id ?? '00000000-0000-0000-0000-000000000000');

  const { data: payslips } = await query;

  return (
    <div>
      <PageHeader
        title={isStaff ? 'All payslips' : 'My payslips'}
        subtitle={isStaff ? 'Every payslip across runs. Employees see only their own (RLS-enforced).' : 'Download any payslip as PDF.'}
      />

      {!payslips?.length ? (
        <EmptyState title="No payslips yet" hint="They appear as soon as payroll runs for a month." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Period</Th>{isStaff ? <Th>Employee</Th> : null}<Th>Status</Th><Th>Gross</Th><Th>Deductions</Th><Th>Tax</Th><Th>Net pay</Th><Th /></tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{p.run?.period_month}/{p.run?.period_year}</Td>
                {isStaff ? <Td>{p.employee?.user?.full_name ?? '—'} <span className="font-mono text-xs text-gray-400">{p.employee?.employee_code}</span></Td> : null}
                <Td><StatusBadge value={p.run?.status} /></Td>
                <Td>{Number(p.gross_salary).toLocaleString()}</Td>
                <Td>{Number(p.absent_deduction + p.half_day_deduction).toLocaleString()}</Td>
                <Td>{Number(p.tax_amount).toLocaleString()}</Td>
                <Td className="font-semibold text-teal-700">{Number(p.net_pay).toLocaleString()}</Td>
                <Td className="text-right">
                  <a href={`/api/payslips/${p.id}/pdf`} target="_blank" className="text-xs font-semibold text-teal-700 underline">Download PDF</a>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {!isStaff ? (
        <p className="mt-4 text-xs text-gray-400"><Badge tone="gray">private</Badge> Only you can see these — salary questions about colleagues are refused by the AI assistant too.</p>
      ) : null}
    </div>
  );
}
