import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card, Badge, btn } from '@/components/ui/primitives';
import ScanBadgeButton from '@/components/attendance/qr-scanner';

/**
 * Attendance hub (checklist 09/10). Staff get the badge scanner (HR at the
 * entrance) plus today's live counts; Employees are sent to their own page.
 */
export default async function AttendanceHubPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role === 'employee') redirect('/attendance/my');

  const today = (await supabase.rpc('local_today')).data;
  const [{ data: todayRows }, { data: pending }] = await Promise.all([
    supabase.from('attendance').select('status').eq('work_date', today),
    supabase.from('attendance_corrections').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const statuses = (todayRows ?? []).map((r) => r.status);
  const count = (s) => statuses.filter((x) => x === s).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Attendance" subtitle={`Today is ${today} — scan badges at the entrance or manage records.`} />

      <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white ring-teal-700">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Badge scanner</p>
            <p className="mt-1 text-sm text-teal-100">
              Scan an employee&apos;s ID badge QR to mark them present — the server stamps the time, the rules decide the status.
            </p>
          </div>
          <ScanBadgeButton defaultMode="in" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Present', count('present'), 'text-teal-700'],
          ['Late', count('late'), 'text-amber-600'],
          ['Half days', count('half_day'), 'text-amber-600'],
          ['Missing checkout', count('missing_checkout'), 'text-red-600'],
        ].map(([label, value, tone]) => (
          <Card key={label} className="text-center">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/attendance/board" className={btn.ghost + ' text-center'}>Daily board</Link>
        <Link href="/attendance/corrections" className={btn.ghost + ' text-center'}>
          Corrections {pending > 0 ? <Badge tone="amber">{pending} pending</Badge> : null}
        </Link>
        <Link href="/payslips" className={btn.ghost + ' text-center'}>Payslips</Link>
      </div>
    </div>
  );
}
