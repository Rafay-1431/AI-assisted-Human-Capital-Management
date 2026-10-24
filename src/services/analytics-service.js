import 'server-only';

/**
 * Analytics service (M7). All numbers are computed on the server via database
 * aggregation (brief: "All numbers computed on the server (database
 * aggregation) and filterable by date range"), then handed to the dashboard
 * pages and the AI summarize tool — so AI answers always match the charts.
 * Queries run through the USER-scoped client, so RLS scopes every metric.
 */

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const pct = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Common: attendance trend for the last N days from the dashboard view. */
async function attendanceTrend(supabase, days = 14) {
  const { data } = await supabase
    .from('v_attendance_daily')
    .select('*')
    .gte('work_date', iso(daysAgo(days - 1)))
    .order('work_date', { ascending: true });
  return (data ?? []).map((r) => ({
    date: r.work_date,
    label: r.work_date.slice(5),
    present: r.present,
    late: r.late,
    halfDay: r.half_day,
    missingCheckout: r.missing_checkout,
  }));
}

/** ── Admin: company level (headcount, attrition, payroll, org structure) ── */
export async function getAdminAnalytics(supabase) {
  const year = new Date().getFullYear();
  const [employees, byDept, payroll, trend, audit] = await Promise.all([
    supabase.from('employees').select('basic_salary, employment_status, exit_date, gender'),
    supabase.from('v_headcount_by_department').select('*').order('headcount', { ascending: false }),
    supabase.from('v_payroll_monthly').select('*').order('period_year').order('period_month'),
    attendanceTrend(supabase, 14),
    supabase
      .from('audit_logs')
      .select('id, created_at, action, actor:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const emps = employees.data ?? [];
  const active = emps.filter((e) => e.employment_status !== 'exited');
  const exitsYtd = emps.filter((e) => e.employment_status === 'exited' && e.exit_date && e.exit_date.startsWith(String(year)));
  const avgSalary = mean(active.map((e) => Number(e.basic_salary)));
  const finalRuns = (payroll.data ?? []).filter((r) => r.status === 'finalized');
  const payrollCostYtd = finalRuns
    .filter((r) => r.period_year === year)
    .reduce((s, r) => s + Number(r.total_net), 0);
  const female = active.filter((e) => e.gender === 'female').length;

  return {
    kpis: {
      headcount: active.length,
      attritionYtdPct: pct(active.length + exitsYtd.length > 0 ? (100 * exitsYtd.length) / (active.length + exitsYtd.length) : 0),
      payrollCostYtd: Math.round(payrollCostYtd),
      avgSalary: Math.round(avgSalary),
    },
    headcountByDept: (byDept.data ?? []).map((r) => ({ name: r.department, headcount: r.headcount, exits: r.exits })),
    payrollMonthly: (payroll.data ?? []).map((r) => ({
      label: `${r.period_month}/${String(r.period_year).slice(2)}`,
      gross: Number(r.total_gross),
      net: Number(r.total_net),
    })),
    trend,
    auditRecent: (audit.data ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor?.full_name ?? 'system',
      at: r.created_at,
    })),
    genderSplit: {
      male: active.filter((e) => e.gender === 'male').length,
      female,
      other: active.filter((e) => e.gender === 'other').length,
    },
  };
}

/** ── HR: people operations (today board, corrections, late-comers) ──────── */
export async function getHrAnalytics(supabase) {
  const today = (await supabase.rpc('local_today')).data;

  const [todayRows, headcount, pendingCorrections, trend, byDeptRaw, lateComers] = await Promise.all([
    supabase
      .from('attendance')
      .select('status')
      .eq('work_date', today),
    supabase.from('employees').select('id', { count: 'exact', head: true }).neq('employment_status', 'exited'),
    supabase.from('attendance_corrections').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    attendanceTrend(supabase, 14),
    supabase
      .from('v_attendance_by_department')
      .select('department, late, present, half_day, missing_checkout')
      .gte('work_date', iso(daysAgo(13))),
    supabase.from('v_late_comers_30d').select('*').order('late_count', { ascending: false }).limit(5),
  ]);

  const statuses = (todayRows.data ?? []).map((r) => r.status);
  const count = (s) => statuses.filter((x) => x === s).length;
  const present = count('present');
  const late = count('late');
  const halfDay = count('half_day');
  const missing = count('missing_checkout');

  const deptAgg = {};
  for (const r of byDeptRaw.data ?? []) {
    const d = (deptAgg[r.department] ??= { present: 0, late: 0, halfDay: 0, missingCheckout: 0 });
    d.present += r.present;
    d.late += r.late;
    d.halfDay += r.half_day;
    d.missingCheckout += r.missing_checkout;
  }

  // Attendance rate per the brief, leave term removed (M5 excluded):
  // (present + late + missing_checkout + 0.5 × half_day) ÷ records
  const records = present + late + halfDay + missing;
  const activeHeadcount = headcount.count ?? 0;

  return {
    today,
    kpis: {
      activeHeadcount,
      present,
      late,
      missingCheckout: missing,
      notCheckedIn: Math.max(0, activeHeadcount - records),
      pendingCorrections: pendingCorrections.count ?? 0,
      attendanceRatePct: pct(records > 0 ? (100 * (present + late + missing + 0.5 * halfDay)) / records : 0),
    },
    trend,
    byDept: Object.entries(deptAgg).map(([name, d]) => ({ name, ...d })),
    lateComers: (lateComers.data ?? []).map((r) => ({
      name: r.full_name,
      code: r.employee_code,
      department: r.department,
      lateCount: r.late_count,
    })),
  };
}

/** ── Employee: personal (hours, lates, last payslip) ────────────────────── */
export async function getEmployeeAnalytics(supabase, employeeId, userId) {
  const since14 = iso(daysAgo(13));
  const since30 = iso(daysAgo(29));
  const monday = iso(daysAgo((new Date().getDay() + 6) % 7)); // last Monday

  const [recent, monthRows, payslipRes, announcements, unread] = await Promise.all([
    supabase
      .from('attendance')
      .select('work_date, check_in_at, check_out_at, status')
      .eq('employee_id', employeeId)
      .gte('work_date', since14)
      .order('work_date', { ascending: true }),
    supabase
      .from('attendance')
      .select('status')
      .eq('employee_id', employeeId)
      .gte('work_date', since30),
    supabase
      .from('payslips')
      .select('id, net_pay, run:payroll_runs(period_year, period_month)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('announcements').select('id, title, created_at').order('created_at', { ascending: false }).limit(3),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  ]);

  const hoursByDay = (recent.data ?? []).map((r) => {
    const hours =
      r.check_in_at && r.check_out_at
        ? (new Date(r.check_out_at) - new Date(r.check_in_at)) / 3600000
        : 0;
    return { label: r.work_date.slice(5), date: r.work_date, hours: Math.round(hours * 10) / 10 };
  });
  const hoursThisWeek = hoursByDay
    .filter((d) => d.date >= monday)
    .reduce((s, d) => s + d.hours, 0);

  const statuses = (monthRows.data ?? []).map((r) => r.status);
  const count = (s) => statuses.filter((x) => x === s).length;
  const payslip = payslipRes.data?.[0] ?? null;

  return {
    kpis: {
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
      hoursTarget: 40,
      lateCount: count('late'),
      presentCount: count('present'),
      halfDayCount: count('half_day'),
    },
    hoursByDay,
    lastPayslip: payslip
      ? { net: Number(payslip.net_pay), period: `${payslip.run?.period_month}/${payslip.run?.period_year}`, id: payslip.id }
      : null,
    announcements: (announcements.data ?? []).map((a) => ({ id: a.id, title: a.title, at: a.created_at })),
    unreadNotifications: unread.count ?? 0,
  };
}
