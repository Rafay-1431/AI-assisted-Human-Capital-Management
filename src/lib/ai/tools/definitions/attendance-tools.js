/**
 * Attendance tools — summary + late-comers (staff). The numbers come from the
 * same views the dashboards use, so AI answers match the dashboard exactly.
 */

const getAttendanceSummary = {
  name: 'get_attendance_summary',
  description:
    'Aggregate attendance status counts for a date range, optionally by department. ' +
    'Answers questions like "what is this month\'s attendance rate?". Staff only.',
  permission: 'staff',
  parameters: {
    type: 'object',
    properties: {
      from: { type: ['string', 'null'], description: 'ISO date (YYYY-MM-DD). Defaults to 30 days ago when null.' },
      to: { type: ['string', 'null'], description: 'ISO date. Defaults to today when null.' },
      department: { type: ['string', 'null'], description: 'Optional department name filter, or null.' },
    },
    required: [],
  },

  async execute(ctx, args = {}) {
    const to = args.to ?? new Date().toISOString().slice(0, 10);
    const from =
      args.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    let query = ctx.supabase
      .from('v_attendance_by_department')
      .select('*')
      .gte('work_date', from)
      .lte('work_date', to);
    if (args.department) query = query.ilike('department', `%${args.department}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const totals = { present: 0, late: 0, half_day: 0, missing_checkout: 0 };
    for (const row of data ?? []) {
      totals.present += row.present;
      totals.late += row.late;
      totals.half_day += row.half_day;
      totals.missing_checkout += row.missing_checkout;
    }

    const records = totals.present + totals.late + totals.half_day + totals.missing_checkout;
    // Brief formula, leave term removed (Module 5 excluded):
    // rate = (present + late + missing_checkout + 0.5 x half_day) / working-day records
    const attendanceRate =
      records > 0
        ? ((totals.present + totals.late + totals.missing_checkout + 0.5 * totals.half_day) /
            records) *
          100
        : 0;

    return { from, to, totals, attendanceRatePct: Math.round(attendanceRate * 10) / 10 };
  },
};

const getLateComers = {
  name: 'get_late_comers',
  description:
    'Top late-comers (most lates first) over the trailing 30 days. Staff only.',
  permission: 'staff',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: ['number', 'null'], description: 'How many to return (default 5, max 10), or null.' },
    },
    required: [],
  },

  async execute(ctx, args = {}) {
    const limit = Math.min(Number(args.limit) || 5, 10);
    const { data, error } = await ctx.supabase
      .from('v_late_comers_30d')
      .select('employee_code, full_name, department, late_count, half_day_count')
      .gt('late_count', 0)
      .order('late_count', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    return { window: 'trailing 30 days', lateComers: data ?? [] };
  },
};

export default [getAttendanceSummary, getLateComers];
