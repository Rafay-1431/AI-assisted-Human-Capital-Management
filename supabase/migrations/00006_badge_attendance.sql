-- ============================================================================
-- HCM Lite — Migration 00006: Badge QR attendance (Module 4 extension)
--
-- Employees carry a digital ID badge whose QR encodes
--   {"type":"hcm-lite-badge","employee_code":"EMP-001"}
-- HR/Admin can scan ANY badge; an Employee scanning a badge can only check
-- in/out THEMSELVES (enforced here, not in the client). The server still
-- stamps the time and derives the status via the existing triggers, and the
-- one-record-per-day 409 still applies.
-- ============================================================================

alter type public.attendance_source add value if not exists 'badge';

-- ---------------------------------------------------------------------------
-- Badge check-in
-- ---------------------------------------------------------------------------
create or replace function public.badge_check_in(p_employee_code text)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_target     public.employees;
  v_caller     public.employees;
  v_cfg        public.company_settings;
  v_tz         text;
  v_now        timestamptz := now();
  v_local_date date;
  v_record     public.attendance;
  v_staff      boolean := public.is_staff();
  v_by_self    boolean;
begin
  if not public.is_active_user() then
    raise exception 'ACCOUNT_INACTIVE' using errcode = 'CM401';
  end if;

  select e.* into v_target
  from public.employees e
  join public.profiles p on p.id = e.user_id
  where e.employee_code = trim(p_employee_code)
    and p.is_active
  limit 1;

  if v_target.id is null then
    raise exception 'BADGE_NOT_FOUND' using errcode = 'CM404';
  end if;

  -- RBAC: staff may scan any badge; employees only their own
  if not v_staff then
    select * into v_caller from public.employees where user_id = auth.uid();
    if v_caller.id is null or v_caller.id <> v_target.id then
      raise exception 'STAFF_ONLY_OR_OWN_BADGE' using errcode = 'CM403';
    end if;
  end if;
  v_by_self := v_target.user_id = auth.uid();

  select * into v_cfg from public.company_settings where id = 1;
  v_tz := coalesce(v_cfg.timezone, 'Asia/Karachi');
  v_local_date := (v_now at time zone v_tz)::date;

  if exists (
    select 1 from public.attendance a
    where a.employee_id = v_target.id and a.work_date = v_local_date
  ) then
    raise exception 'ALREADY_CHECKED_IN_TODAY' using errcode = 'CM409';
  end if;

  insert into public.attendance (employee_id, work_date, check_in_at, check_in_source)
  values (v_target.id, v_local_date, v_now, 'badge')
  returning * into v_record;   -- status derived by trg_attendance_status

  perform public.log_audit('attendance.badge_in', 'attendance', v_record.id, null,
    jsonb_build_object('employee', v_target.employee_code,
                       'by', case when v_by_self then 'self' else 'staff' end));

  if not v_by_self then
    perform public.notify_user(v_target.user_id, 'system', 'Attendance marked',
      'You were checked in by HR at ' || to_char(v_now at time zone v_tz, 'HH24:MI') || '.',
      '/attendance/my');
  end if;

  return v_record;
end $$;

-- ---------------------------------------------------------------------------
-- Badge check-out
-- ---------------------------------------------------------------------------
create or replace function public.badge_check_out(p_employee_code text)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_target  public.employees;
  v_caller  public.employees;
  v_cfg     public.company_settings;
  v_tz      text;
  v_record  public.attendance;
  v_staff   boolean := public.is_staff();
  v_by_self boolean;
begin
  if not public.is_active_user() then
    raise exception 'ACCOUNT_INACTIVE' using errcode = 'CM401';
  end if;

  select e.* into v_target
  from public.employees e
  join public.profiles p on p.id = e.user_id
  where e.employee_code = trim(p_employee_code)
    and p.is_active
  limit 1;

  if v_target.id is null then
    raise exception 'BADGE_NOT_FOUND' using errcode = 'CM404';
  end if;

  if not v_staff then
    select * into v_caller from public.employees where user_id = auth.uid();
    if v_caller.id is null or v_caller.id <> v_target.id then
      raise exception 'STAFF_ONLY_OR_OWN_BADGE' using errcode = 'CM403';
    end if;
  end if;
  v_by_self := v_target.user_id = auth.uid();

  select timezone into v_tz from public.company_settings where id = 1;
  v_tz := coalesce(v_tz, 'Asia/Karachi');

  select * into v_record
  from public.attendance a
  where a.employee_id = v_target.id
    and a.work_date = (now() at time zone v_tz)::date
    and a.check_out_at is null
  for update;

  if v_record.id is null then
    raise exception 'NO_OPEN_CHECK_IN' using errcode = 'CM410';
  end if;

  update public.attendance
  set check_out_at = now(), check_out_source = 'badge'
  where id = v_record.id
  returning * into v_record;   -- status recomputed by trg_attendance_status

  perform public.log_audit('attendance.badge_out', 'attendance', v_record.id, to_jsonb(v_record), null,
    jsonb_build_object('employee', v_target.employee_code,
                       'by', case when v_by_self then 'self' else 'staff' end));

  if not v_by_self then
    perform public.notify_user(v_target.user_id, 'system', 'Attendance marked',
      'You were checked out by HR at ' || to_char(now() at time zone v_tz, 'HH24:MI') || '.',
      '/attendance/my');
  end if;

  return v_record;
end $$;

grant execute on function public.badge_check_in(text) to authenticated;
grant execute on function public.badge_check_out(text) to authenticated;
revoke execute on function public.badge_check_in(text) from anon, public;
revoke execute on function public.badge_check_out(text) from anon, public;
