import 'server-only';
import { assertStaff, assertRole, ActionError } from './guard';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Payroll Lite rules engine (M6) — the reference "rules in services" module.
 *
 * Brief formulas (Leave excluded — there is no unpaid-leave deduction term):
 *   gross      = 1.5 x basic            (HRA 40% + medical 10% of basic)
 *   per_day    = gross / working_days   (prorated for joiners/leavers)
 *   deductions = absent_days x per_day + 0.5 x half_days x per_day
 *   tax        = slab(annual_gross = gross x 12) / 12
 *   net        = gross − deductions − tax
 *
 * Attendance statuses map to payable time as:
 *   present | late | missing_checkout → 1.0 day
 *   half_day                          → 0.5 day
 *   no record on a working day        → absent (derived, never stored)
 *
 * Split of responsibility: this module COMPUTES (pure, unit-testable JS);
 * create_payroll_run / finalize_payroll_run in Postgres VALIDATE the caller
 * and WRITE atomically with the finalized-run lock.
 */

const FULL_DAY_STATUSES = ['present', 'late', 'missing_checkout'];

/** @param {number} year @param {number} month 1–12 */
function monthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day of month
  return { start, end };
}

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Working days in [from, to] inclusive, skipping configured weekends + holidays.
 * @param {Date} from @param {Date} to
 * @param {number[]} weekendDays JS day numbers (0 = Sunday … 6 = Saturday)
 * @param {Set<string>} holidaySet ISO dates
 */
export function countWorkingDays(from, to, weekendDays, holidaySet) {
  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = iso(cursor);
    if (!weekendDays.includes(cursor.getUTCDay()) && !holidaySet.has(key)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Progressive slab tax. Slab row: { min_amount, max_amount, rate_pct, flat_amount }
 * tax = flat_amount + rate% x (annualGross − min_amount)
 */
export function calculateAnnualTax(annualGross, slabs) {
  const slab = slabs.find(
    (s) =>
      annualGross >= Number(s.min_amount) &&
      (s.max_amount == null || annualGross < Number(s.max_amount)),
  );
  if (!slab) return 0;
  const excess = Math.max(0, annualGross - Number(slab.min_amount));
  return Number(slab.flat_amount) + (Number(slab.rate_pct) / 100) * excess;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Pure computation of a month's draft — used by BOTH the preview action and
 * the create action (create always recomputes server-side; the client never
 * sends payroll numbers).
 */
export async function computePayrollPreview({ year, month }) {
  const supabase = await getSupabaseServerClient();
  const { start, end } = monthRange(year, month);

  const [settingsRes, holidaysRes, slabsRes, employeesRes, attendanceRes, existingRes] =
    await Promise.all([
      supabase.from('company_settings').select('*').eq('id', 1).single(),
      supabase
        .from('holidays')
        .select('holiday_date')
        .gte('holiday_date', iso(start))
        .lte('holiday_date', iso(end)),
      supabase.from('tax_slabs').select('*').order('sort_order'),
      supabase
        .from('employees')
        .select(
          'id, employee_code, basic_salary, join_date, exit_date, employment_status, ' +
            'department:departments(name), user:profiles(full_name)',
        ),
      supabase
        .from('attendance')
        .select('employee_id, work_date, status')
        .gte('work_date', iso(start))
        .lte('work_date', iso(end)),
      supabase
        .from('payroll_runs')
        .select('id')
        .eq('period_year', year)
        .eq('period_month', month)
        .maybeSingle(),
    ]);

  if (existingRes.data) {
    throw new ActionError(
      'RUN_EXISTS',
      `A payroll run for ${month}/${year} already exists. Finalize or wait for the next cycle.`,
    );
  }

  const cfg = settingsRes.data;
  if (!cfg) throw new ActionError('NO_SETTINGS', 'Complete company setup first.');

  const weekendDays = cfg.weekend_days ?? [0, 6];
  const holidaySet = new Set((holidaysRes.data ?? []).map((h) => h.holiday_date));
  const slabs = slabsRes.data ?? [];

  // Group attendance statuses by employee
  /** @type {Map<string, string[]>} */
  const attByEmployee = new Map();
  for (const row of attendanceRes.data ?? []) {
    if (!attByEmployee.has(row.employee_id)) attByEmployee.set(row.employee_id, []);
    attByEmployee.get(row.employee_id).push(row.status);
  }

  /** @type {object[]} */
  const payslips = [];
  const monthStartIso = iso(start);
  const monthEndIso = iso(end);

  for (const e of employeesRes.data ?? []) {
    // Prorate joiners/leavers (brief: "Prorate joiners/leavers")
    if (e.join_date > monthEndIso) continue; // joins after this month
    if (e.exit_date && e.exit_date < monthStartIso) continue; // left before this month

    const effStart = e.join_date > monthStartIso ? new Date(`${e.join_date}T00:00:00Z`) : start;
    const effEnd = e.exit_date && e.exit_date <= monthEndIso ? new Date(`${e.exit_date}T00:00:00Z`) : end;

    const workingDays = countWorkingDays(effStart, effEnd, weekendDays, holidaySet);
    if (workingDays <= 0) continue;

    const statuses = attByEmployee.get(e.id) ?? [];
    const presentDays = statuses.filter((s) => FULL_DAY_STATUSES.includes(s)).length;
    const halfDayCount = statuses.filter((s) => s === 'half_day').length;
    const lateCount = statuses.filter((s) => s === 'late').length;
    const workedDays = presentDays + 0.5 * halfDayCount;
    const absentDays = Math.max(0, workingDays - workedDays);

    const basic = Number(e.basic_salary);
    const gross = 1.5 * basic;
    const hra = 0.4 * basic;
    const medical = 0.1 * basic;
    const perDay = gross / workingDays;
    const absentDeduction = absentDays * perDay;
    const halfDayDeduction = 0.5 * halfDayCount * perDay;
    const annualTaxable = gross * 12;
    const tax = calculateAnnualTax(annualTaxable, slabs) / 12;
    const net = gross - absentDeduction - halfDayDeduction - tax;

    payslips.push({
      employee_id: e.id,
      employee_code: e.employee_code,
      full_name: e.user?.full_name ?? '',
      department: e.department?.name ?? 'Unassigned',
      basic_salary: round2(basic),
      gross_salary: round2(gross),
      hra: round2(hra),
      medical: round2(medical),
      working_days: workingDays,
      present_days: presentDays,
      late_count: lateCount,
      half_day_count: halfDayCount,
      absent_days: round2(absentDays),
      per_day_rate: round2(perDay),
      absent_deduction: round2(absentDeduction),
      half_day_deduction: round2(halfDayDeduction),
      annual_taxable: round2(annualTaxable),
      tax_amount: round2(tax),
      net_pay: round2(net),
      breakdown: {
        hra_pct: 40,
        medical_pct: 10,
        gross_multiplier: 1.5,
        payroll_mode: 'leave_excluded',
      },
    });
  }

  const totals = payslips.reduce(
    (acc, p) => ({
      gross: acc.gross + p.gross_salary,
      deductions: acc.deductions + p.absent_deduction + p.half_day_deduction,
      tax: acc.tax + p.tax_amount,
      net: acc.net + p.net_pay,
    }),
    { gross: 0, deductions: 0, tax: 0, net: 0 },
  );

  return {
    period: { year, month },
    working_days: countWorkingDays(start, end, weekendDays, holidaySet),
    payslips,
    totals: {
      gross: round2(totals.gross),
      deductions: round2(totals.deductions),
      tax: round2(totals.tax),
      net: round2(totals.net),
      employee_count: payslips.length,
    },
  };
}

/** Preview (HR/Admin). Compute-only; writes nothing. */
export async function previewPayrollRun({ year, month }) {
  await assertStaff();
  return await computePayrollPreview({ year, month });
}

/** Create the draft (HR/Admin): recompute server-side, then write via RPC. */
export async function createPayrollRun({ year, month }) {
  const session = await assertStaff();
  const preview = await computePayrollPreview({ year, month });

  const { data: runId, error } = await session.supabase.rpc('create_payroll_run', {
    p_year: year,
    p_month: month,
    p_working_days: preview.working_days,
    p_payslips: preview.payslips,
  });

  if (error) {
    if (error.code === '23505') {
      throw new ActionError('RUN_EXISTS', `A payroll run for ${month}/${year} already exists.`);
    }
    throw new ActionError('RPC_FAILED', error.message);
  }
  return { runId };
}

/** Finalize (Admin only — enforced again inside the RPC). */
export async function finalizePayrollRun(runId) {
  const session = await assertRole('admin');
  const { error } = await session.supabase.rpc('finalize_payroll_run', { p_run_id: runId });
  if (error) throw new ActionError('RPC_FAILED', error.message);
  return { runId };
}
