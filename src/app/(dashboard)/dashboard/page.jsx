import Link from 'next/link';
import { requireUser } from '@/services/guard';
import { getAdminAnalytics, getHrAnalytics, getEmployeeAnalytics } from '@/services/analytics-service';
import { PageHeader } from '@/components/ui/primitives';
import { KpiCard, ChartCard, AttendanceTrendChart, DeptBarChart, PayrollTrendChart, HoursBarChart } from '@/components/charts/charts';
import SummarizeCard from '@/components/ai/summarize-card';

const fmt = (n) => Number(n ?? 0).toLocaleString();

/**
 * Role-routed dashboards (M7, checklist 18): every KPI and chart is computed
 * server-side from real rows (analytics-service) — empty companies render
 * honest zeros, never demo data.
 */
export default async function DashboardPage() {
  const { profile, user, supabase } = await requireUser();
  const role = profile.role;

  if (role === 'admin') {
    const a = await getAdminAnalytics(supabase);
    return (
      <div className="space-y-6">
        <PageHeader title="Company dashboard" subtitle="Headcount, attrition, payroll cost and structure — live from the database." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Headcount" value={fmt(a.kpis.headcount)} hint="Active + probation" />
          <KpiCard label="Attrition YTD" value={`${a.kpis.attritionYtdPct}%`} hint="Exits ÷ average headcount" />
          <KpiCard label="Payroll cost YTD" value={fmt(a.kpis.payrollCostYtd)} hint="Finalized runs, net" />
          <KpiCard label="Average salary" value={fmt(a.kpis.avgSalary)} hint="Mean basic of active staff" />
        </div>
        <SummarizeCard kpis={a.kpis} filters={{ role, window: 'ytd' }} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Headcount by department">
            {a.headcountByDept.length ? <DeptBarChart data={a.headcountByDept} dataKey="headcount" name="Headcount" /> : <EmptyChart text="Register employees to see the org structure." />}
          </ChartCard>
          <ChartCard title="Attendance trend" subtitle="Last 14 days — present vs late">
            {a.trend.length ? <AttendanceTrendChart data={a.trend} /> : <EmptyChart text="No attendance recorded yet." />}
          </ChartCard>
          <ChartCard title="Payroll cost by month" subtitle="Gross vs net across all runs">
            {a.payrollMonthly.length ? <PayrollTrendChart data={a.payrollMonthly} /> : <EmptyChart text="Run payroll to see monthly cost." />}
          </ChartCard>
          <ChartCard title="Recent audit activity">
            {a.auditRecent.length ? (
              <ul className="h-48 space-y-2 overflow-y-auto text-sm">
                {a.auditRecent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="font-mono text-xs text-gray-600">{r.action}</span>
                    <span className="text-xs text-gray-400">{r.actor} · {new Date(r.at).toLocaleDateString('en-GB')}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyChart text="No actions recorded yet." />}
          </ChartCard>
        </div>
      </div>
    );
  }

  if (role === 'hr') {
    const h = await getHrAnalytics(supabase);
    return (
      <div className="space-y-6">
        <PageHeader title="HR dashboard" subtitle={`Today is ${h.today} — live board counts, trends and late-comers.`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Present today" value={fmt(h.kpis.present)} hint={`${h.kpis.activeHeadcount} active employees`} />
          <KpiCard label="Late today" value={fmt(h.kpis.late)} hint="Check-in after office start + grace" />
          <KpiCard label="Pending corrections" value={fmt(h.kpis.pendingCorrections)} hint="Awaiting your review" />
          <KpiCard label="Attendance rate (14d)" value={`${h.kpis.attendanceRatePct}%`} hint="Present + late + 0.5 × half-day" />
        </div>
        <SummarizeCard kpis={h.kpis} filters={{ role, date: h.today, window: '14d' }} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Attendance trend" subtitle="Last 14 days">
            {h.trend.length ? <AttendanceTrendChart data={h.trend} /> : <EmptyChart text="No attendance recorded yet." />}
          </ChartCard>
          <ChartCard title="Lates by department" subtitle="Last 14 days">
            {h.byDept.length ? <DeptBarChart data={h.byDept} dataKey="late" name="Late" color="#d97706" /> : <EmptyChart text="No attendance recorded yet." />}
          </ChartCard>
        </div>
        <ChartCard title="Top late-comers" subtitle="Trailing 30 days">
          {h.lateComers.length ? (
            <ul className="h-48 space-y-2 overflow-y-auto text-sm">
              {h.lateComers.map((r, i) => (
                <li key={r.code} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="font-medium text-gray-800">{i + 1}. {r.name} <span className="text-xs text-gray-400">{r.department}</span></span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{r.lateCount} lates</span>
                </li>
              ))}
            </ul>
          ) : <EmptyChart text="Nobody has been late — impressive." />}
        </ChartCard>
      </div>
    );
  }

  // Employee
  const { data: empRow } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!empRow) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
        <p className="font-semibold text-gray-900">No employee profile linked</p>
        <p className="mt-1 text-sm text-gray-500">Ask HR to register you as an employee to unlock attendance and payslips.</p>
      </div>
    );
  }
  const e = await getEmployeeAnalytics(supabase, empRow.id, user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="My dashboard" subtitle="Your hours, punctuality and payslips — visible only to you." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Hours this week" value={`${e.kpis.hoursThisWeek}h`} hint={`Target ${e.kpis.hoursTarget}h`} />
        <KpiCard label="Late count (30d)" value={fmt(e.kpis.lateCount)} hint="Check-ins after 09:15" />
        <KpiCard label="Days present (30d)" value={fmt(e.kpis.presentCount)} hint={`${e.kpis.halfDayCount} half day(s)`} />
        <KpiCard
          label="Last payslip"
          value={e.lastPayslip ? fmt(e.lastPayslip.net) : '—'}
          hint={e.lastPayslip ? `Net pay · ${e.lastPayslip.period}` : 'Appears after payroll runs'}
        />
      </div>

      <ChartCard title="My hours per day" subtitle="Last 14 days — from server-stamped check-in/out">
        {e.hoursByDay.length ? <HoursBarChart data={e.hoursByDay} /> : <EmptyChart text="Check in and out to start tracking your hours." />}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 font-semibold text-gray-900">Latest announcements</p>
          {e.announcements.length ? (
            <ul className="space-y-2 text-sm">
              {e.announcements.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-800">{a.title}</span>
                  <span className="text-xs text-gray-400">{new Date(a.at).toLocaleDateString('en-GB')}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-400">No announcements yet.</p>}
          <Link href="/announcements" className="mt-3 inline-block text-xs font-semibold text-teal-700 underline">View all</Link>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 font-semibold text-gray-900">My ID badge</p>
          <p className="text-sm text-gray-500">
            Present your digital badge at the entrance — HR scans the QR and the server marks you present.
          </p>
          <Link href="/attendance/badge" className="mt-3 inline-block text-xs font-semibold text-teal-700 underline">Open my badge</Link>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 font-semibold text-gray-900">Ask my assistant</p>
          <p className="text-sm text-gray-500">
            Open the AI Assistant (top-right) and ask things like “how many hours did I work this week?” or “what is the late rule?” — it answers
            only from your own data and company policy.
          </p>
          <Link href="/attendance/my" className="mt-3 inline-block text-xs font-semibold text-teal-700 underline">Check in now</Link>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
      {text}
    </div>
  );
}
