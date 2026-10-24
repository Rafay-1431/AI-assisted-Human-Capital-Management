-- ============================================================================
-- HCM Lite — Analytics views (M7)
--
-- All views are created with security_invoker = on, so every query against
-- them is filtered by the SAME RLS policies as the base tables. That means:
--   - Admin/HR get company-wide aggregates,
--   - an Employee querying a view silently sees only their own rows.
-- The dashboard services (server-side) call these views; the AI tools reuse
-- the same services, so AI answers always match the dashboards (Figure 3).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Directory convenience view (joins the four directory tables in one query)
-- ---------------------------------------------------------------------------
create view public.v_employee_directory
with (security_invoker = on) as
select
  e.id,
  e.employee_code,
  p.full_name,
  p.email,
  d.name  as department,
  ds.title as designation,
  e.employment_status,
  e.join_date,
  e.exit_date,
  e.basic_salary,
  e.phone,
  e.user_id
from public.employees e
join public.profiles p       on p.id  = e.user_id
left join public.departments d  on d.id  = e.department_id
left join public.designations ds on ds.id = e.designation_id;

-- ---------------------------------------------------------------------------
-- Attendance per day (status counts) — feeds trend + rate charts
-- ---------------------------------------------------------------------------
create view public.v_attendance_daily
with (security_invoker = on) as
select
  a.work_date,
  count(*) filter (where a.status = 'present')           as present,
  count(*) filter (where a.status = 'late')              as late,
  count(*) filter (where a.status = 'half_day')          as half_day,
  count(*) filter (where a.status = 'missing_checkout')  as missing_checkout
from public.attendance a
group by a.work_date;

-- ---------------------------------------------------------------------------
-- Attendance by department per day — feeds "attendance by department" bars
-- ---------------------------------------------------------------------------
create view public.v_attendance_by_department
with (security_invoker = on) as
select
  a.work_date,
  coalesce(d.name, 'Unassigned') as department,
  count(*) filter (where a.status = 'present')          as present,
  count(*) filter (where a.status = 'late')             as late,
  count(*) filter (where a.status = 'half_day')         as half_day,
  count(*) filter (where a.status = 'missing_checkout') as missing_checkout
from public.attendance a
join public.employees e on e.id = a.employee_id
left join public.departments d on d.id = e.department_id
group by a.work_date, d.name;

-- ---------------------------------------------------------------------------
-- Top late-comers over the trailing 30 days (HR dashboard)
-- ---------------------------------------------------------------------------
create view public.v_late_comers_30d
with (security_invoker = on) as
select
  e.id                       as employee_id,
  e.employee_code,
  p.full_name,
  coalesce(d.name, 'Unassigned') as department,
  count(*) filter (where a.status = 'late')  as late_count,
  count(*) filter (where a.status = 'half_day') as half_day_count
from public.attendance a
join public.employees e on e.id = a.employee_id
join public.profiles p  on p.id  = e.user_id
left join public.departments d on d.id = e.department_id
where a.work_date >= (now() - interval '30 days')::date
group by e.id, e.employee_code, p.full_name, d.name
order by late_count desc;

-- ---------------------------------------------------------------------------
-- Headcount by department (Admin dashboard)
-- ---------------------------------------------------------------------------
create view public.v_headcount_by_department
with (security_invoker = on) as
select
  coalesce(d.name, 'Unassigned') as department,
  count(*) filter (where e.employment_status in ('active', 'probation')) as headcount,
  count(*) filter (where e.employment_status = 'exited')                 as exits
from public.employees e
left join public.departments d on d.id = e.department_id
group by d.name;

-- ---------------------------------------------------------------------------
-- Payroll cost by month (from run totals; employees get no rows because
-- payroll_runs is staff-only under RLS)
-- ---------------------------------------------------------------------------
create view public.v_payroll_monthly
with (security_invoker = on) as
select
  r.period_year,
  r.period_month,
  r.status,
  r.working_days,
  r.employee_count,
  r.total_gross,
  r.total_deductions,
  r.total_tax,
  r.total_net,
  r.finalized_at
from public.payroll_runs r;

-- ---------------------------------------------------------------------------
-- Payroll cost by department for a run (finalized or draft)
-- ---------------------------------------------------------------------------
create view public.v_payroll_by_department
with (security_invoker = on) as
select
  ps.payroll_run_id,
  r.period_year,
  r.period_month,
  coalesce(d.name, 'Unassigned') as department,
  count(*)                        as employees,
  sum(ps.gross_salary)            as gross,
  sum(ps.tax_amount)              as tax,
  sum(ps.net_pay)                 as net
from public.payslips ps
join public.payroll_runs r on r.id = ps.payroll_run_id
join public.employees e    on e.id = ps.employee_id
left join public.departments d on d.id = e.department_id
group by ps.payroll_run_id, r.period_year, r.period_month, d.name;

-- ---------------------------------------------------------------------------
-- Personal monthly summary (Employee dashboard: hours, lates, half days)
-- ---------------------------------------------------------------------------
create view public.v_my_monthly_summary
with (security_invoker = on) as
select
  a.employee_id,
  date_trunc('month', a.work_date)::date as month,
  count(*)                               as days_recorded,
  count(*) filter (where a.status in ('present', 'late', 'missing_checkout')) as full_days,
  count(*) filter (where a.status = 'late')       as late_count,
  count(*) filter (where a.status = 'half_day')   as half_day_count,
  round(sum(
    extract(epoch from (a.check_out_at - a.check_in_at)) / 3600.0
  )::numeric, 2)                                  as hours_worked
from public.attendance a
group by a.employee_id, date_trunc('month', a.work_date);

-- ============================================================================
-- Realtime: broadcast row changes for the Redux <-> Supabase sync layer.
-- (No-ops gracefully if the publication or table was already added.)
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendance_corrections;
exception when duplicate_object then null;
end $$;
