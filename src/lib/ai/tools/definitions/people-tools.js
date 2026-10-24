/**
 * People tools — headcount + directory search + self-summary.
 * ctx: { userId, role, employeeId, supabase } (user-scoped server client).
 */

const getHeadcount = {
  name: 'get_headcount',
  description:
    'Count employees. Optionally filter by department name and employment status. Staff only.',
  permission: 'staff',
  parameters: {
    type: 'object',
    properties: {
      department: { type: ['string', 'null'], description: 'Exact or partial department name, or null for all.' },
      status: {
        type: ['string', 'null'],
        enum: ['probation', 'active', 'exited', null],
        description: 'Employment status filter, or null for all.',
      },
    },
    required: [],
  },

  async execute(ctx, args = {}) {
    let query = ctx.supabase
      .from('v_employee_directory')
      .select('id, department, employment_status');
    if (args.status) query = query.eq('employment_status', args.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = args.department
      ? (data ?? []).filter((r) =>
          (r.department ?? '').toLowerCase().includes(String(args.department).toLowerCase()),
        )
      : data ?? [];

    const byDepartment = {};
    for (const row of rows) {
      byDepartment[row.department ?? 'Unassigned'] =
        (byDepartment[row.department ?? 'Unassigned'] ?? 0) + 1;
    }
    return { total: rows.length, byDepartment };
  },
};

const searchEmployees = {
  name: 'search_employees',
  description:
    'Search the employee directory by name, code or department. Returns names, codes, ' +
    'departments, designations, status and join date. SALARY IS NEVER INCLUDED. Staff only.',
  permission: 'staff',
  parameters: {
    type: 'object',
    properties: {
      query: { type: ['string', 'null'], description: 'Free text: name or employee code, or null.' },
      department: { type: ['string', 'null'], description: 'Department name filter, or null.' },
      limit: { type: ['number', 'null'], description: 'Max rows (default 10, max 25), or null.' },
    },
    required: [],
  },

  async execute(ctx, args = {}) {
    let query = ctx.supabase
      .from('v_employee_directory')
      .select(
        'id, employee_code, full_name, department, designation, employment_status, join_date',
      )
      .limit(Math.min(Number(args.limit) || 10, 25));

    if (args.query) query = query.or(`full_name.ilike.%${args.query}%,employee_code.ilike.%${args.query}%`);
    if (args.department) query = query.ilike('department', `%${args.department}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { employees: data ?? [] };
  },
};

const getMySummary = {
  name: 'get_my_summary',
  description:
    'Return the CALLING user’s own attendance summary (last 30 days) and their most recent ' +
    'payslip if any. Works for every role; only ever returns the caller’s own data.',
  permission: 'all',
  parameters: { type: 'object', properties: {}, required: [] },

  async execute(ctx) {
    if (!ctx.employeeId) {
      return { message: 'No employee record is linked to your account.' };
    }

    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [attendanceRes, payslipRes] = await Promise.all([
      ctx.supabase
        .from('attendance')
        .select('status')
        .eq('employee_id', ctx.employeeId)
        .gte('work_date', since),
      ctx.supabase
        .from('payslips')
        .select('gross_salary, deductions:absent_deduction, tax_amount, net_pay, payroll_run_id')
        .eq('employee_id', ctx.employeeId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (attendanceRes.error) throw new Error(attendanceRes.error.message);

    const statuses = attendanceRes.data ?? [];
    const count = (s) => statuses.filter((r) => r.status === s).length;
    const payslip = payslipRes.data?.[0] ?? null;

    return {
      periodDays: 30,
      present: count('present'),
      late: count('late'),
      halfDay: count('half_day'),
      missingCheckout: count('missing_checkout'),
      lastPayslip: payslip
        ? { gross: payslip.gross_salary, tax: payslip.tax_amount, net: payslip.net_pay }
        : 'No payslip yet — payroll has not run.',
    };
  },
};

export default [getHeadcount, searchEmployees, getMySummary];
