import Link from 'next/link';
import { requireStaff } from '@/services/guard';
import { PageHeader, EmptyState, TableWrap, Th, Td, StatusBadge, btn } from '@/components/ui/primitives';

/** Payroll runs (checklist 15/16) — HR/Admin manage, Admin finalizes. */
export default async function PayrollRunsPage() {
  const { supabase } = await requireStaff();

  const { data: runs } = await supabase
    .from('payroll_runs')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  return (
    <div>
      <PageHeader title="Payroll runs" subtitle="One run per month. Draft runs can be reviewed; only Admin can finalize — finalized runs are locked forever.">
        <Link href="/payroll/new" className={btn.primary}>New monthly run</Link>
      </PageHeader>

      {!runs?.length ? (
        <EmptyState title="No payroll runs yet" hint="Create the first monthly run — it computes gross, deductions and tax from real attendance." />
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>Period</Th><Th>Status</Th><Th>Employees</Th><Th>Gross</Th><Th>Deductions</Th><Th>Tax</Th><Th>Net</Th><Th /></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{r.period_month}/{r.period_year}</Td>
                <Td><StatusBadge value={r.status} /></Td>
                <Td>{r.employee_count}</Td>
                <Td>{Number(r.total_gross).toLocaleString()}</Td>
                <Td>{Number(r.total_deductions).toLocaleString()}</Td>
                <Td>{Number(r.total_tax).toLocaleString()}</Td>
                <Td className="font-semibold">{Number(r.total_net).toLocaleString()}</Td>
                <Td className="text-right"><Link href={`/payroll/${r.id}`} className={btn.small}>Open</Link></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
