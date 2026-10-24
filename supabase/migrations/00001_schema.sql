-- ============================================================================
-- HCM Lite — Schema (Modules M1–M9; Module 5 "Leave" intentionally excluded)
-- Target: Supabase / PostgreSQL 15+
-- Run order: 00001_schema → 00002_rls_policies → 00003_functions_triggers
--            → 00004_analytics_views → 00005_config_seed
--
-- No dummy data: every business row is created through the app (Admin setup,
-- HR registration, daily attendance, payroll runs). Only configuration rows
-- (tax slabs defined by the brief) are seeded, in 00005.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'hr', 'employee');

create type public.employment_status as enum ('probation', 'active', 'exited');

-- M5 excluded: there is no 'on_leave' status. If Leave is ever re-added,
-- extend this enum in a new migration (do not edit this one).
create type public.attendance_status as enum ('present', 'late', 'half_day', 'missing_checkout', 'absent');
-- NOTE: 'absent' is never stored — absence is derived as
-- (working days − worked days) in the payroll/dashboard services.

create type public.attendance_source as enum ('web', 'camera', 'correction');

create type public.correction_status as enum ('pending', 'approved', 'rejected');

create type public.payroll_run_status as enum ('draft', 'finalized');

create type public.announcement_audience as enum ('all', 'hr', 'employees');

create type public.notification_type as enum (
  'correction_approved',
  'correction_rejected',
  'payroll_ready',
  'payroll_finalized',
  'announcement',
  'account',
  'system'
);

-- ---------------------------------------------------------------------------
-- M1 — Identity mirror of auth.users (role lives here, RLS reads it)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text        not null unique,
  full_name            text        not null,
  role                 public.app_role not null default 'employee',
  is_active            boolean     not null default true,
  must_change_password boolean     not null default false,  -- temp-password flow (M1)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.profiles is
  'Mirrors auth.users with app role + activation state. Roles: admin, hr, employee.';

-- ---------------------------------------------------------------------------
-- M2 — Company settings (singleton row; created by the first-run setup)
-- ---------------------------------------------------------------------------
create table public.company_settings (
  id                     int primary key default 1 check (id = 1),
  company_name           text        not null,
  office_start_time      time        not null default '09:00',
  grace_minutes          int         not null default 15  check (grace_minutes between 0 and 120),
  half_day_threshold_hours numeric(4,2) not null default 5.00 check (half_day_threshold_hours > 0),
  weekend_days           smallint[]  not null default '{0,6}',  -- JS day numbers, 0 = Sunday
  office_latitude        double precision,
  office_longitude       double precision,
  office_radius_m        int         default 150 check (office_radius_m > 0),
  timezone               text        not null default 'Asia/Karachi',
  is_setup_complete      boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.company_settings is
  'Singleton (id = 1). M2 rules: office start, grace, half-day threshold, weekend, office geofence.';

-- ---------------------------------------------------------------------------
-- M2 — Organization structure
-- ---------------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  description text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table public.designations (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null unique,
  description text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date        not null unique,
  title        text        not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- M6 — Tax slabs (configuration; rows seeded in 00005, editable by Admin)
-- ---------------------------------------------------------------------------
create table public.tax_slabs (
  id          uuid primary key default gen_random_uuid(),
  min_amount  numeric(14,2) not null,
  max_amount  numeric(14,2),                      -- null = no upper bound
  rate_pct    numeric(5,2)  not null,
  flat_amount numeric(14,2) not null default 0,   -- cumulative tax at slab floor
  sort_order  int           not null,
  unique (min_amount, max_amount)
);

comment on table public.tax_slabs is
  'Progressive slabs on ANNUAL gross (gross x 12). tax = flat_amount + rate_pct * (annual_gross - min_amount).';

-- ---------------------------------------------------------------------------
-- M3 — Employees (employment record; login = linked profile)
-- ---------------------------------------------------------------------------
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid        not null unique references public.profiles (id) on delete cascade,
  employee_code     text        not null unique,
  department_id     uuid        references public.departments (id)   on delete set null,
  designation_id    uuid        references public.designations (id)  on delete set null,
  manager_id        uuid        references public.employees (id)     on delete set null,
  employment_status public.employment_status not null default 'probation',
  join_date         date        not null,
  exit_date         date,
  gender            text        check (gender in ('male', 'female', 'other')),
  date_of_birth     date,
  phone             text,       -- employee may edit own phone + address (M3 checklist 06)
  address           text,
  basic_salary      numeric(12,2) not null check (basic_salary > 0),  -- gross = 1.5 x basic (M6)
  created_by        uuid        references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_employees_department on public.employees (department_id);
create index idx_employees_status     on public.employees (employment_status);

-- Department head (added here to break the circular FK)
alter table public.departments
  add column head_employee_id uuid references public.employees (id) on delete set null;

-- ---------------------------------------------------------------------------
-- M4 — Attendance (one record per employee per day; server stamps the time)
-- ---------------------------------------------------------------------------
create table public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid        not null references public.employees (id) on delete cascade,
  work_date          date        not null,
  check_in_at        timestamptz,
  check_out_at       timestamptz,
  check_in_source    public.attendance_source,
  check_out_source   public.attendance_source,
  status             public.attendance_status,  -- derived from times by trigger (00003)
  check_in_lat       double precision,
  check_in_lng       double precision,
  check_in_distance_m numeric(8,2),
  check_in_meta      jsonb,        -- camera extras: accuracy, face count. Result only, never a photo.
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (employee_id, work_date),  -- "second check-in = 409" (M4)
  constraint attendance_times_order
    check (check_out_at is null or check_in_at is null or check_out_at > check_in_at)
);

create index idx_attendance_work_date on public.attendance (work_date);
create index idx_attendance_employee  on public.attendance (employee_id);

-- ---------------------------------------------------------------------------
-- M4 — Attendance corrections (Employee requests, HR approves)
-- ---------------------------------------------------------------------------
create table public.attendance_corrections (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid        not null references public.employees (id) on delete cascade,
  attendance_id       uuid        references public.attendance (id) on delete set null,
  work_date           date        not null,
  requested_check_in  timestamptz,
  requested_check_out timestamptz,
  reason              text        not null check (char_length(reason) between 3 and 500),
  status              public.correction_status not null default 'pending',
  reviewed_by         uuid        references public.profiles (id) on delete set null,
  review_comment      text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_corrections_status   on public.attendance_corrections (status);
create index idx_corrections_employee on public.attendance_corrections (employee_id);

-- ---------------------------------------------------------------------------
-- M6 — Payroll runs + payslips (draft → finalized; finalized is immutable)
-- ---------------------------------------------------------------------------
create table public.payroll_runs (
  id               uuid primary key default gen_random_uuid(),
  period_year      int not null check (period_year between 2000 and 2100),
  period_month     int not null check (period_month between 1 and 12),
  status           public.payroll_run_status not null default 'draft',
  working_days     int not null check (working_days > 0),
  employee_count   int not null default 0,
  total_gross      numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,   -- absent + half-day deductions
  total_tax        numeric(14,2) not null default 0,
  total_net        numeric(14,2) not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  finalized_by     uuid references public.profiles (id) on delete set null,
  finalized_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (period_year, period_month)  -- one run per month
);

create table public.payslips (
  id                 uuid primary key default gen_random_uuid(),
  payroll_run_id     uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id        uuid not null references public.employees (id) on delete cascade,
  basic_salary       numeric(12,2) not null,
  gross_salary       numeric(12,2) not null,   -- 1.5 x basic
  hra                numeric(12,2) not null,   -- 40% of basic
  medical            numeric(12,2) not null,   -- 10% of basic
  working_days       int           not null,   -- prorated for joiners/leavers
  present_days       int           not null default 0,  -- full days (present + late + missing_checkout)
  late_count         int           not null default 0,
  half_day_count     int           not null default 0,
  absent_days        numeric(5,1)  not null default 0,  -- derived: working_days − (full + 0.5 x half)
  per_day_rate       numeric(12,2) not null,
  absent_deduction   numeric(12,2) not null default 0,
  half_day_deduction numeric(12,2) not null default 0,
  annual_taxable     numeric(14,2) not null,    -- gross x 12
  tax_amount         numeric(12,2) not null default 0,  -- annual tax / 12
  net_pay            numeric(12,2) not null,
  breakdown          jsonb,        -- extra audit info (slab used, percentages, notes)
  created_at         timestamptz not null default now(),

  unique (payroll_run_id, employee_id)
);

create index idx_payslips_employee on public.payslips (employee_id);

-- ---------------------------------------------------------------------------
-- M9 — Comms & Audit
-- ---------------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text       not null check (char_length(title) between 3 and 200),
  body       text       not null check (char_length(body) between 3 and 5000),
  audience   public.announcement_audience not null default 'all',
  posted_by  uuid       not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null default 'system',
  title      text        not null,
  body       text,
  link       text,                      -- in-app route, e.g. '/payslips'
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications (user_id) where is_read = false;

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_role   public.app_role,
  action       text not null,   -- e.g. 'employee.create', 'payroll.finalize'
  entity       text not null,   -- e.g. 'employee', 'payroll_run'
  entity_id    uuid,
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);

create index idx_audit_created on public.audit_logs (created_at desc);

create table public.ai_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  role       public.app_role,
  tool_name  text,
  success    boolean,
  latency_ms int,
  error      text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index idx_ai_logs_user_created on public.ai_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- M8 — Chat persistence is intentionally NOT in the DB: conversation history
-- lives client-side (Redux) and every call is audited in ai_logs.
-- ---------------------------------------------------------------------------
