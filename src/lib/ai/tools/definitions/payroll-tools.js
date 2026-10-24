/**
 * Payroll tools — aggregate payroll summary (staff). Individual salaries are
 * NEVER exposed through AI tools; only run-level aggregates.
 */

const getPayrollSummary = {
  name: 'get_payroll_summary',
  description:
    'Payroll totals for a month (year, month): employees paid, gross, deductions, tax, net ' +
    'and the run status. Omit arguments for the latest run. Staff only.',
  permission: 'staff',
  parameters: {
    type: 'object',
    properties: {
      year: { type: ['number', 'null'], description: 'e.g. 2026, or null for the latest run.' },
      month: { type: ['number', 'null'], description: '1–12, or null for the latest run.' },
    },
    required: [],
  },

  async execute(ctx, args = {}) {
    let query = ctx.supabase
      .from('payroll_runs')
      .select('period_year, period_month, status, employee_count, total_gross, total_deductions, total_tax, total_net')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1);

    if (args.year && args.month) {
      query = ctx.supabase
        .from('payroll_runs')
        .select('period_year, period_month, status, employee_count, total_gross, total_deductions, total_tax, total_net')
        .eq('period_year', args.year)
        .eq('period_month', args.month)
        .limit(1);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const run = data?.[0];
    if (!run) return { message: 'No payroll run found. Payroll has not been run yet.' };

    return {
      period: `${run.period_month}/${run.period_year}`,
      status: run.status,
      employeesPaid: run.employee_count,
      totalGross: run.total_gross,
      totalDeductions: run.total_deductions,
      totalTax: run.total_tax,
      totalNet: run.total_net,
    };
  },
};

export default [getPayrollSummary];
