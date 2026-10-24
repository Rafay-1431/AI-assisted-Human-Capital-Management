-- ============================================================================
-- HCM Lite — Business rules as SECURITY DEFINER functions + guard triggers
--
-- Why definer RPCs: the browser only ever talks to Supabase with the user's
-- JWT, so RLS scopes rows. But rules that must NOT depend on client input —
-- server-stamped times, the one-check-in-per-day 409, payroll locking,
-- cross-user notifications, append-only audit — run inside definer functions
-- that validate the caller's role FIRST (public.has_role / is_staff) and then
-- write atomically.
--
-- Error codes used by services to map to HTTP-like statuses:
--   CM401 account inactive        CM402 no employee profile
--   CM409 already checked in      CM410 no check-in / already checked out
--   CM422 face check failed       CM423 GPS accuracy too low
--   CM424 outside office radius   CM425 office location not configured
--   CM429 AI rate limit
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generic updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_profiles_updated_at      before update on public.profiles              for each row execute function public.set_updated_at();
create trigger trg_settings_updated_at      before update on public.company_settings      for each row execute function public.set_updated_at();
create trigger trg_employees_updated_at     before update on public.employees             for each row execute function public.set_updated_at();
create trigger trg_attendance_updated_at    before update on public.attendance            for each row execute function public.set_updated_at();
create trigger trg_corrections_updated_at   before update on public.attendance_corrections for each row execute function public.set_updated_at();
create trigger trg_payroll_runs_updated_at  before update on public.payroll_runs          for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Geo helper (M5 of the brief's bonus section: Haversine on the server)
-- ---------------------------------------------------------------------------
create or replace function public.haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql immutable
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- M4 status rules (server-owned, derived from times + company settings)
--   - late            : check-in after office_start + grace
--   - half_day        : worked duration < half_day_threshold_hours
--   - missing_checkout: check-out missing AND the day is already over
--   - present         : otherwise
--   'absent' is never stored; it is derived (no record on a working day).
-- ---------------------------------------------------------------------------
create or replace function public.compute_attendance_status(
  p_check_in  timestamptz,
  p_check_out timestamptz,
  p_work_date date
)
returns public.attendance_status
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg   public.company_settings;
  v_tz    text;
  v_local time;
  v_start time;
  v_late  boolean;
  v_hours numeric;
begin
  select * into v_cfg from public.company_settings where id = 1;
  v_tz    := coalesce(v_cfg.timezone, 'Asia/Karachi');
  v_start := coalesce(v_cfg.office_start_time, '09:00');
  v_local := (p_check_in at time zone v_tz)::time;
  v_late  := v_local > v_start + make_interval(mins => coalesce(v_cfg.grace_minutes, 15));

  if p_check_out is null then
    if p_work_date < (now() at time zone v_tz)::date then
      return 'missing_checkout';   -- day is over, still no check-out
    end if;
    return case when v_late then 'late' else 'present' end;  -- still on shift
  end if;

  v_hours := extract(epoch from (p_check_out - p_check_in)) / 3600.0;
  if v_hours < coalesce(v_cfg.half_day_threshold_hours, 5) then
    return 'half_day';
  end if;
  if v_late then
    return 'late';
  end if;
  return 'present';
end $$;

-- Derived status maintenance: keep status always consistent with the times
create or replace function public.trg_attendance_set_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.status := public.compute_attendance_status(new.check_in_at, new.check_out_at, new.work_date);
  return new;
end $$;

create trigger trg_attendance_status
  before insert or update of check_in_at, check_out_at, work_date on public.attendance
  for each row execute function public.trg_attendance_set_status();

-- ---------------------------------------------------------------------------
-- M4 — web check-in / check-out (server stamps the time; client sends only
-- the claim). Camera source additionally enforces: exactly one face, GPS
-- accuracy <= 100 m, Haversine distance <= office radius.
-- ---------------------------------------------------------------------------
create or replace function public.web_check_in(
  p_source     public.attendance_source default 'web',
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy_m double precision default null,
  p_face_count int              default null
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee  public.employees;
  v_cfg       public.company_settings;
  v_tz        text;
  v_now       timestamptz := now();
  v_local_date date;
  v_distance  double precision;
  v_record    public.attendance;
begin
  if not public.is_active_user() then
    raise exception 'ACCOUNT_INACTIVE' using errcode = 'CM401';
  end if;

  select * into v_employee from public.employees where user_id = auth.uid();
  if v_employee.id is null then
    raise exception 'NO_EMPLOYEE_PROFILE' using errcode = 'CM402';
  end if;

  select * into v_cfg from public.company_settings where id = 1;
  v_tz := coalesce(v_cfg.timezone, 'Asia/Karachi');
  v_local_date := (v_now at time zone v_tz)::date;

  if p_source = 'camera' then
    if v_cfg.office_latitude is null or v_cfg.office_longitude is null then
      raise exception 'OFFICE_LOCATION_NOT_CONFIGURED' using errcode = 'CM425';
    end if;
    if p_face_count is distinct from 1 then
      raise exception 'FACE_CHECK_FAILED' using errcode = 'CM422';
    end if;
    if p_accuracy_m is null or p_accuracy_m > 100 then
      raise exception 'GPS_ACCURACY_TOO_LOW' using errcode = 'CM423';
    end if;
    v_distance := public.haversine_m(v_cfg.office_latitude, v_cfg.office_longitude, p_lat, p_lng);
    if v_distance is null or v_distance > coalesce(v_cfg.office_radius_m, 150) then
      raise exception 'OUTSIDE_OFFICE_RADIUS' using errcode = 'CM424';
    end if;
  end if;

  -- One record per employee per day → 409
  if exists (
    select 1 from public.attendance a
    where a.employee_id = v_employee.id and a.work_date = v_local_date
  ) then
    raise exception 'ALREADY_CHECKED_IN_TODAY' using errcode = 'CM409';
  end if;

  insert into public.attendance (
    employee_id, work_date, check_in_at, check_in_source,
    check_in_lat, check_in_lng, check_in_distance_m, check_in_meta
  ) values (
    v_employee.id, v_local_date, v_now, p_source,
    p_lat, p_lng, v_distance,
    case
      when p_source = 'camera' then
        jsonb_build_object('accuracy_m', p_accuracy_m, 'face_count', p_face_count)
      else null
    end
  )
  returning * into v_record;

  perform public.log_audit('attendance.check_in', 'attendance', v_record.id, null, to_jsonb(v_record));
  return v_record;
end $$;

create or replace function public.web_check_out(
  p_source     public.attendance_source default 'web',
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy_m double precision default null,
  p_face_count int              default null
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee  public.employees;
  v_tz        text;
  v_record    public.attendance;
begin
  if not public.is_active_user() then
    raise exception 'ACCOUNT_INACTIVE' using errcode = 'CM401';
  end if;

  select * into v_employee from public.employees where user_id = auth.uid();
  if v_employee.id is null then
    raise exception 'NO_EMPLOYEE_PROFILE' using errcode = 'CM402';
  end if;

  select timezone into v_tz from public.company_settings where id = 1;
  v_tz := coalesce(v_tz, 'Asia/Karachi');

  select * into v_record
  from public.attendance a
  where a.employee_id = v_employee.id
    and a.work_date = (now() at time zone v_tz)::date
  for update;

  if v_record.id is null then
    raise exception 'NO_CHECK_IN_TODAY' using errcode = 'CM410';
  end if;
  if v_record.check_out_at is not null then
    raise exception 'ALREADY_CHECKED_OUT_TODAY' using errcode = 'CM410';
  end if;

  update public.attendance
  set check_out_at = now(),
      check_out_source = p_source
  where id = v_record.id
  returning * into v_record;  -- status recomputed by trg_attendance_status

  perform public.log_audit('attendance.check_out', 'attendance', v_record.id, to_jsonb(v_record), null);
  return v_record;
end $$;

grant execute on function public.web_check_in(public.attendance_source, double precision, double precision, double precision, int) to authenticated;
grant execute on function public.web_check_out(public.attendance_source, double precision, double precision, double precision, int) to authenticated;
revoke execute on function public.web_check_in(public.attendance_source, double precision, double precision, double precision, int) from anon, public;
revoke execute on function public.web_check_out(public.attendance_source, double precision, double precision, double precision, int) from anon, public;

-- Server-local "today" in the company timezone (employees cannot read settings)
create or replace function public.local_today()
returns date
language plpgsql stable security definer set search_path = ''
as $$
declare v_tz text;
begin
  select timezone into v_tz from public.company_settings where id = 1;
  return (now() at time zone coalesce(v_tz, 'Asia/Karachi'))::date;
end $$;

grant execute on function public.local_today() to authenticated;

-- ---------------------------------------------------------------------------
-- M4 — correction review (HR approves/rejects; approval applies the times and
-- recomputes the attendance row atomically, then notifies the employee)
-- ---------------------------------------------------------------------------
create or replace function public.review_correction(
  p_correction_id uuid,
  p_approve       boolean,
  p_comment       text default null
)
returns public.attendance_corrections
language plpgsql security definer set search_path = ''
as $$
declare
  v_corr   public.attendance_corrections;
  v_user_id uuid;
begin
  if not public.is_staff() then
    raise exception 'ONLY_STAFF_CAN_REVIEW' using errcode = '42501';
  end if;

  select * into v_corr from public.attendance_corrections
  where id = p_correction_id for update;

  if v_corr.id is null then
    raise exception 'CORRECTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_corr.status <> 'pending' then
    raise exception 'CORRECTION_ALREADY_REVIEWED' using errcode = 'CM409';
  end if;

  update public.attendance_corrections set
    status         = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by    = auth.uid(),
    review_comment = p_comment,
    reviewed_at    = now(),
    updated_at     = now()
  where id = p_correction_id
  returning * into v_corr;

  if p_approve then
    insert into public.attendance (
      employee_id, work_date,
      check_in_at, check_out_at,
      check_in_source, check_out_source, notes
    ) values (
      v_corr.employee_id, v_corr.work_date,
      v_corr.requested_check_in, v_corr.requested_check_out,
      'correction', 'correction',
      'Applied from correction ' || v_corr.id::text
    )
    on conflict (employee_id, work_date) do update
      set check_in_at      = excluded.check_in_at,
          check_out_at     = excluded.check_out_at,
          check_in_source  = 'correction',
          check_out_source = 'correction',
          updated_at       = now();
  end if;

  select e.user_id into v_user_id from public.employees e where e.id = v_corr.employee_id;
  perform public.notify_user(
    v_user_id,
    case when p_approve then 'correction_approved' else 'correction_rejected' end,
    case when p_approve then 'Attendance correction approved' else 'Attendance correction rejected' end,
    coalesce(p_comment, ''),
    '/attendance/my'
  );

  perform public.log_audit('correction.review', 'attendance_correction', v_corr.id, to_jsonb(v_corr), null);
  return v_corr;
end $$;

grant execute on function public.review_correction(uuid, boolean, text) to authenticated;
revoke execute on function public.review_correction(uuid, boolean, text) from anon, public;

-- State machine guard: only pending → approved|rejected; payload immutable
create or replace function public.trg_corrections_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.employee_id is distinct from old.employee_id
     or new.work_date is distinct from old.work_date
     or new.requested_check_in is distinct from old.requested_check_in
     or new.requested_check_out is distinct from old.requested_check_out then
    raise exception 'CORRECTION_FIELDS_ARE_IMMUTABLE' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'CORRECTION_ALREADY_REVIEWED' using errcode = 'CM409';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'INVALID_CORRECTION_TRANSITION' using errcode = '42501';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end $$;

create trigger trg_corrections_state
  before update on public.attendance_corrections
  for each row execute function public.trg_corrections_guard();

-- ---------------------------------------------------------------------------
-- M6 — Payroll: HR/Admin create the draft (computed in the JS service, written
-- atomically here), ONLY Admin finalizes, and finalized runs are locked hard.
-- ---------------------------------------------------------------------------
create or replace function public.create_payroll_run(
  p_year        int,
  p_month       int,
  p_working_days int,
  p_payslips    jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_run_id uuid;
  v_cnt    int;
  s_gross  numeric;
  s_ded    numeric;
  s_tax    numeric;
  s_net    numeric;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_working_days is null or p_working_days <= 0 then
    raise exception 'INVALID_WORKING_DAYS' using errcode = 'CM422';
  end if;

  insert into public.payroll_runs (period_year, period_month, status, working_days, created_by)
  values (p_year, p_month, 'draft', p_working_days, auth.uid())
  returning id into v_run_id;   -- unique(period_year, period_month) → 23505 if exists

  insert into public.payslips (
    payroll_run_id, employee_id, basic_salary, gross_salary, hra, medical,
    working_days, present_days, late_count, half_day_count, absent_days,
    per_day_rate, absent_deduction, half_day_deduction,
    annual_taxable, tax_amount, net_pay, breakdown
  )
  select
    v_run_id,
    x.employee_id, x.basic_salary, x.gross_salary, x.hra, x.medical,
    x.working_days, x.present_days, x.late_count, x.half_day_count, x.absent_days,
    x.per_day_rate, x.absent_deduction, x.half_day_deduction,
    x.annual_taxable, x.tax_amount, x.net_pay, x.breakdown
  from jsonb_to_recordset(p_payslips) as x(
    employee_id uuid, basic_salary numeric, gross_salary numeric, hra numeric, medical numeric,
    working_days int, present_days int, late_count int, half_day_count int, absent_days numeric,
    per_day_rate numeric, absent_deduction numeric, half_day_deduction numeric,
    annual_taxable numeric, tax_amount numeric, net_pay numeric, breakdown jsonb
  );

  select count(*)::int, coalesce(sum(gross_salary), 0), coalesce(sum(absent_deduction + half_day_deduction), 0),
         coalesce(sum(tax_amount), 0), coalesce(sum(net_pay), 0)
  into v_cnt, s_gross, s_ded, s_tax, s_net
  from public.payslips where payroll_run_id = v_run_id;

  update public.payroll_runs set
    employee_count = v_cnt, total_gross = s_gross,
    total_deductions = s_ded, total_tax = s_tax, total_net = s_net
  where id = v_run_id;

  -- Notify every employee in the run that their payslip is ready
  perform public.notify_user(
    e.user_id, 'payroll_ready', 'Your payslip is ready',
    'Payslip for period ' || p_month::text || '/' || p_year::text, '/payslips'
  )
  from public.payslips ps
  join public.employees e on e.id = ps.employee_id
  where ps.payroll_run_id = v_run_id;

  perform public.log_audit(
    'payroll.create', 'payroll_run', v_run_id, null,
    jsonb_build_object('year', p_year, 'month', p_month, 'employees', v_cnt, 'total_net', s_net)
  );
  return v_run_id;
end $$;

create or replace function public.finalize_payroll_run(p_run_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.payroll_runs;
begin
  if not public.has_role('admin') then
    raise exception 'ONLY_ADMIN_CAN_FINALIZE' using errcode = '42501';
  end if;

  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'RUN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_run.status = 'finalized' then
    raise exception 'ALREADY_FINALIZED' using errcode = 'CM409';
  end if;

  update public.payroll_runs set
    status = 'finalized', finalized_by = auth.uid(), finalized_at = now(), updated_at = now()
  where id = p_run_id;

  perform public.notify_user(
    p.user_id, 'payroll_finalized', 'Payslips finalized',
    'Payslips for ' || v_run.period_month::text || '/' || v_run.period_year::text || ' are final.', '/payslips'
  )
  from public.profiles p
  where p.role = 'employee' and p.is_active;

  perform public.log_audit('payroll.finalize', 'payroll_run', p_run_id, to_jsonb(v_run), null);
end $$;

grant execute on function public.create_payroll_run(int, int, int, jsonb) to authenticated;
grant execute on function public.finalize_payroll_run(uuid) to authenticated;
revoke execute on function public.create_payroll_run(int, int, int, jsonb) from anon, public;
revoke execute on function public.finalize_payroll_run(uuid) from anon, public;

-- Hard lock: NO ONE (not even Admin, not even service role via user paths)
-- edits or deletes a finalized run or its payslips. This mirrors the brief:
-- "Cannot edit a payroll run after it is finalized."
create or replace function public.prevent_finalized_payroll_edit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.payroll_run_status;
begin
  if tg_table_name = 'payroll_runs' then
    v_status := old.status;
  else
    select status into v_status from public.payroll_runs where id = old.payroll_run_id;
  end if;
  if v_status = 'finalized' then
    raise exception 'PAYROLL_RUN_IS_LOCKED' using errcode = 'CM409';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_payroll_runs_lock
  before update or delete on public.payroll_runs
  for each row execute function public.prevent_finalized_payroll_edit();

create trigger trg_payslips_lock
  before update or delete on public.payslips
  for each row execute function public.prevent_finalized_payroll_edit();

-- ---------------------------------------------------------------------------
-- Column guards (RLS cannot restrict columns; triggers do)
-- ---------------------------------------------------------------------------
-- Employees may only edit their own phone + address
create or replace function public.trg_employees_guard_self_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.current_app_role() = 'employee' then
    if new.employee_code     is distinct from old.employee_code
       or new.department_id  is distinct from old.department_id
       or new.designation_id is distinct from old.designation_id
       or new.employment_status is distinct from old.employment_status
       or new.join_date      is distinct from old.join_date
       or new.exit_date      is distinct from old.exit_date
       or new.gender         is distinct from old.gender
       or new.date_of_birth  is distinct from old.date_of_birth
       or new.basic_salary   is distinct from old.basic_salary
       or new.manager_id     is distinct from old.manager_id
       or new.user_id        is distinct from old.user_id
       or new.created_by     is distinct from old.created_by then
      raise exception 'EMPLOYEES_CAN_ONLY_EDIT_PHONE_AND_ADDRESS' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger trg_employees_columns
  before update on public.employees
  for each row execute function public.trg_employees_guard_self_update();

-- Non-admins can never touch role / activation / email; they may only
-- self-clear must_change_password after setting a new password.
create or replace function public.trg_profiles_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.current_app_role() <> 'admin' then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or (new.must_change_password is distinct from old.must_change_password
           and not (old.must_change_password and new.must_change_password = false)) then
      raise exception 'PROFILE_FIELDS_ARE_ADMIN_MANAGED' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger trg_profiles_columns
  before update on public.profiles
  for each row execute function public.trg_profiles_guard_update();

-- Notifications are immutable except is_read
create or replace function public.trg_notifications_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.link is distinct from old.link then
    raise exception 'NOTIFICATIONS_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_notifications_columns
  before update on public.notifications
  for each row execute function public.trg_notifications_guard_update();

-- ---------------------------------------------------------------------------
-- M9 — cross-user notifications (RLS prevents users writing others' rows;
-- these definer helpers are the only legal path)
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(
  p_user_id uuid,
  p_type    public.notification_type,
  p_title   text,
  p_body    text default null,
  p_link    text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
end $$;

create or replace function public.notify_role(
  p_role  public.app_role,
  p_type  public.notification_type,
  p_title text,
  p_body  text default null,
  p_link  text default null
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link from public.profiles
  where role = p_role and is_active
$$;

grant execute on function public.notify_user(uuid, public.notification_type, text, text, text) to authenticated;
grant execute on function public.notify_role(public.app_role, public.notification_type, text, text, text) to authenticated;
revoke execute on function public.notify_user(uuid, public.notification_type, text, text, text) from anon, public;
revoke execute on function public.notify_role(public.app_role, public.notification_type, text, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- M9 — append-only audit log (actor is always the JWT identity, never client input)
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action    text,
  p_entity    text,
  p_entity_id uuid default null,
  p_before    jsonb default null,
  p_after     jsonb default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, before_state, after_state)
  values (auth.uid(), public.current_app_role(), p_action, p_entity, p_entity_id, p_before, p_after);
end $$;

grant execute on function public.log_audit(text, text, uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.log_audit(text, text, uuid, jsonb, jsonb) from anon, public;
