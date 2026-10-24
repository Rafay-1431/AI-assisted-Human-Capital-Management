-- ============================================================================
-- HCM Lite — Row Level Security
--
-- Strategy
--   1. SECURITY DEFINER helper functions (below) read the caller's role from
--      profiles WITHOUT triggering recursive RLS. Policies call them wrapped
--      in a scalar subquery — (select public.is_staff()) — so Postgres caches
--      them as an InitPlan per statement instead of per row.
--   2. Row scoping is done here (RLS). Business RULES (status computation,
--      409 check-in, payroll lock) live in the SECURITY DEFINER RPCs of 00003.
--   3. Tables with no insert/update/delete policy are writable only by the
--      security-definer RPCs or the service-role key (server actions only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (all SECURITY DEFINER + STABLE, fixed empty search_path)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select e.id from public.employees e where e.user_id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_active from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = p_role and p.is_active
  )
$$;

-- admin OR hr
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'hr') and p.is_active
  )
$$;

-- Used by middleware/anon client to decide whether to show /setup or /login
create or replace function public.app_initialized()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.company_settings where is_setup_complete)
$$;

grant execute on function public.app_initialized() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.company_settings      enable row level security;
alter table public.departments           enable row level security;
alter table public.designations          enable row level security;
alter table public.holidays              enable row level security;
alter table public.tax_slabs             enable row level security;
alter table public.employees             enable row level security;
alter table public.attendance            enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.payroll_runs          enable row level security;
alter table public.payslips              enable row level security;
alter table public.announcements         enable row level security;
alter table public.notifications         enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.ai_logs               enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — self read; staff read (directory joins); admin manages
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or (select public.is_staff()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or (select public.has_role('admin')))
  with check (id = auth.uid() or (select public.has_role('admin')));
-- Column-level safety for non-admins is enforced by trg_profiles_guard_update (00003).
-- Insert/delete: none (service role during setup / account creation only).

-- ---------------------------------------------------------------------------
-- company_settings — staff view, admin edits
-- ---------------------------------------------------------------------------
create policy company_settings_select on public.company_settings
  for select to authenticated
  using ((select public.is_staff()));

create policy company_settings_update on public.company_settings
  for update to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- Organization structure — everyone reads, admin writes
-- ---------------------------------------------------------------------------
create policy departments_select on public.departments
  for select to authenticated using (true);
create policy departments_write on public.departments
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

create policy designations_select on public.designations
  for select to authenticated using (true);
create policy designations_write on public.designations
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

create policy holidays_select on public.holidays
  for select to authenticated using (true);
create policy holidays_write on public.holidays
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- tax_slabs — staff reads (payroll), admin edits
-- ---------------------------------------------------------------------------
create policy tax_slabs_select on public.tax_slabs
  for select to authenticated
  using ((select public.is_staff()));
create policy tax_slabs_write on public.tax_slabs
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- employees — staff manage; employee sees own row and edits phone/address only
-- (column guard: trg_employees_guard_self_update in 00003)
-- ---------------------------------------------------------------------------
create policy employees_select on public.employees
  for select to authenticated
  using ((select public.is_staff()) or id = (select public.current_employee_id()));

create policy employees_insert on public.employees
  for insert to authenticated
  with check ((select public.is_staff()));

create policy employees_update on public.employees
  for update to authenticated
  using ((select public.is_staff()) or id = (select public.current_employee_id()))
  with check ((select public.is_staff()) or id = (select public.current_employee_id()));
-- Delete: none — exit is a status change (employment_status = 'exited').

-- ---------------------------------------------------------------------------
-- attendance — self view; staff manage; direct inserts denied (rpc web_check_in)
-- ---------------------------------------------------------------------------
create policy attendance_select on public.attendance
  for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.current_employee_id()));

create policy attendance_update on public.attendance
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy attendance_delete on public.attendance
  for delete to authenticated
  using ((select public.has_role('admin')));
-- Insert: none — only public.web_check_in / review_correction (00003) write rows.

-- ---------------------------------------------------------------------------
-- attendance_corrections — employee requests, staff reviews (state machine in 00003)
-- ---------------------------------------------------------------------------
create policy corrections_select on public.attendance_corrections
  for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.current_employee_id()));

create policy corrections_insert on public.attendance_corrections
  for insert to authenticated
  with check (
    employee_id = (select public.current_employee_id())
    and status = 'pending'
    and (select public.is_active_user())
  );

create policy corrections_update on public.attendance_corrections
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- payroll — staff sees runs; payslips visible to staff and the owning employee.
-- All writes go through create_payroll_run / finalize_payroll_run (00003).
-- ---------------------------------------------------------------------------
create policy payroll_runs_select on public.payroll_runs
  for select to authenticated
  using ((select public.is_staff()));

create policy payslips_select on public.payslips
  for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.current_employee_id()));

-- ---------------------------------------------------------------------------
-- announcements — staff posts; visibility by audience
-- ---------------------------------------------------------------------------
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    (select public.is_staff())
    or audience = 'all'
    or (audience = 'employees' and (select public.has_role('employee')))
  );

create policy announcements_insert on public.announcements
  for insert to authenticated
  with check ((select public.is_staff()));

create policy announcements_delete on public.announcements
  for delete to authenticated
  using (posted_by = auth.uid() or (select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- notifications — strictly own; insert via notify_* RPCs only (00003);
-- update limited to is_read by trg_notifications_guard_update (00003)
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_logs — insert via log_audit RPC only; Admin read-only.
-- No update/delete policies exist at all: the log is append-only by design.
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- ai_logs — writes happen server-side with the service-role key; Admin audits
-- ---------------------------------------------------------------------------
create policy ai_logs_select on public.ai_logs
  for select to authenticated
  using ((select public.has_role('admin')));
