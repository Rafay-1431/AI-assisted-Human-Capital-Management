# HCM Lite — Project Structure (Next.js App Router, JavaScript, RTK)

Stack: Next.js App Router + JavaScript (ES6+, JSDoc), Tailwind CSS, Supabase
(Postgres + RLS + Realtime), Redux Toolkit, Recharts, TanStack Table.

## Full tree

```
hcm-lite/
├── .env.example                     # env contract (see file)
├── jsconfig.json                    # "@/*" → "./src/*" path alias
├── package.json                     # next, react, @reduxjs/toolkit, react-redux,
│                                    # @supabase/ssr, @supabase/supabase-js,
│                                    # recharts, @tanstack/react-table, tailwindcss
├── supabase/
│   └── migrations/                  # run in order (SQL editor or `supabase db push`)
│       ├── 00001_schema.sql         # tables, enums, FKs, constraints, indexes
│       ├── 00002_rls_policies.sql   # role helpers + RLS for every table
│       ├── 00003_functions_triggers.sql  # business rules: check-in rpcs, payroll
│       │                            # create/finalize + lock, guards, audit, notify
│       ├── 00004_analytics_views.sql     # security_invoker views + realtime tables
│       └── 00005_config_seed.sql    # tax slabs (configuration, NOT demo data)
├── docs/
│   ├── PROJECT_STRUCTURE.md         # this file
│   └── IMPLEMENTATION_BLUEPRINT.md  # phase-by-phase build plan
└── src/
    ├── proxy.js                     # Next 16 gate: session refresh + first-run/auth/role (ex-middleware)
    ├── app/
    │   ├── layout.jsx               # <StoreProvider> + globals + theme
    │   ├── page.jsx                 # redirect by role
    │   ├── login/page.jsx
    │   ├── setup/page.jsx           # first-run wizard (company + Admin)
    │   ├── change-password/page.jsx # temp-password flow
    │   ├── (dashboard)/             # authed shell: sidebar + topbar + chat drawer
    │   │   ├── layout.jsx
    │   │   ├── dashboard/page.jsx        # role-routed KPI dashboard (M7)
    │   │   ├── organization/             # M2 (Admin; HR views structure pages)
    │   │   │   ├── settings/page.jsx
    │   │   │   ├── departments/page.jsx
    │   │   │   ├── designations/page.jsx
    │   │   │   ├── holidays/page.jsx
    │   │   │   ├── tax-slabs/page.jsx
    │   │   │   └── users/page.jsx        # create HR logins, reset, deactivate
    │   │   ├── employees/                # M3
    │   │   │   ├── page.jsx              # directory: search/filter/sort/paging
    │   │   │   ├── new/page.jsx          # register employee (creates login)
    │   │   │   ├── import/page.jsx       # CSV dry-run wizard + export
    │   │   │   └── [id]/page.jsx         # Employee 360
    │   │   ├── attendance/               # M4
    │   │   │   ├── my/page.jsx           # own calendar + check-in/out widget
    │   │   │   ├── board/page.jsx        # daily board (staff)
    │   │   │   └── corrections/page.jsx  # request (own) / approve (HR)
    │   │   ├── payroll/                  # M6
    │   │   │   ├── page.jsx              # runs list
    │   │   │   ├── new/page.jsx          # wizard: pick month → preview → create
    │   │   │   └── [id]/page.jsx         # run detail, finalize (Admin), payslips
    │   │   ├── payslips/page.jsx         # own payslips + PDF download
    │   │   ├── announcements/page.jsx    # M9 (post: staff / read: all)
    │   │   ├── notifications/page.jsx
    │   │   └── audit-log/page.jsx        # Admin only
    │   └── api/
    │       └── ai/chat/route.js          # the only AI endpoint (server-only key)
    ├── actions/                     # 'use server' — thin orchestration, serializable
    │   ├── auth-actions.js          # session, password, first-run setup, user mgmt
    │   ├── attendance-actions.js    # check-in/out rpcs, corrections, board
    │   ├── payroll-actions.js       # preview/create/finalize
    │   ├── ai-actions.js            # dashboard summarize
    │   └── (org-actions.js, employee-actions.js, comms-actions.js  → Phase 3–4/9)
    ├── services/                    # server-only business RULES (import 'server-only')
    │   ├── guard.js                 # require*/assert* role+scope guards, ActionError
    │   ├── payroll-service.js       # M6 rules engine (working days, prorate, tax)
    │   └── (org/employee/attendance/analytics/csv/pdf services → later phases)
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.js            # browser client (user-scoped, RLS applies)
    │   │   ├── server.js            # request client via cookies (RLS applies)
    │   │   └── admin.js             # service-role: setup, auth.admin, ai_logs ONLY
    │   ├── ai/
    │   │   ├── ai-provider.js       # provider registry + normalized contract
    │   │   ├── ai-service.js        # tool loop, 15s timeout, rate limit, ai_logs
    │   │   ├── providers/
    │   │   │   ├── openai-provider.js
    │   │   │   └── anthropic-provider.js
    │   │   ├── prompts/system-prompt.js   # policy Q&A (attendance/payroll rules)
    │   │   └── tools/
    │   │       ├── index.js         # registry + permission filter
    │   │       └── definitions/     # people / attendance / payroll tools (no leave)
    │   ├── constants/permissions.js # ROLES, ROUTE_ROLES, NAV_ITEMS (shared client+server)
    │   └── utils/                   # dates.js, money.js, format.js (Phase 2+)
    ├── store/                       # Redux Toolkit
    │   ├── store.js                 # makeStore()
    │   ├── StoreProvider.jsx        # client provider (ref-held store)
    │   ├── hooks.js                 # useAppDispatch/useAppSelector + selectors
    │   └── slices/
    │       ├── authSlice.js         # session mirror, role, profile, thunks
    │       ├── uiSlice.js           # sidebar, theme, modals, toasts, unread count
    │       ├── filterSlice.js       # per-screen filters (directory/board/analytics/…)
    │       ├── attendanceSlice.js   # check-in widget + camera gate + correction form
    │       └── payrollSlice.js      # run wizard (step/period/preview/create/finalize)
    ├── hooks/
    │   └── use-realtime.js          # Supabase Realtime → Redux bridge
    └── components/
        ├── providers/SessionSync.jsx     # server session → authSlice (hydration-safe)
        ├── layout/                       # Sidebar, Topbar, NotificationBell, AiChatDrawer
        ├── ui/                           # shadcn-style primitives (button, card, dialog…)
        ├── data-table/DataTable.jsx      # BambooHR-style: sort/filter/paginate (TanStack)
        ├── charts/                       # KpiCard, TrendLine, DeptBars, Donut (Recharts)
        ├── attendance/                   # CheckInWidget, CameraGate, CorrectionForm, Board
        ├── employees/                    # DirectoryTable, Employee360, CsvImportWizard
        ├── payroll/                      # RunWizard, RunTotals, PayslipView
        ├── dashboard/                    # KpiGrid, InsightList, AiSummaryCard
        ├── ai/                           # ChatPanel, ChatMessage, SmartReply
        └── comms/                        # AnnouncementList, NotificationList
```

## Conventions (the parts that keep this maintainable)

**1. Two clients, two jobs.** Browser + server clients carry the user's JWT —
every query hits RLS. The service-role admin client is allowed ONLY in
first-run setup, `auth.admin` account operations, and `ai_logs` infrastructure.
If a `services/*.js` file doesn't import `admin.js`, it can't escalate.

**2. Actions are thin, services hold rules.** `actions/*` = guard → query/rpc →
map errors to serializable `{ ok, ... }` → `revalidatePath`. `services/*` =
pure business logic (see `payroll-service.js` as the reference). Never import a
service from client code; services start with `import 'server-only'`.

**3. Security lives in three reinforcing layers.**
- Postgres RLS (`00002`) — row scoping, enforced even if an action has a bug.
- Definer RPCs (`00003`) — rules that must not trust the client (check-in time
  stamps, 409, geofence/face checks, payroll lock, cross-user notify, audit).
- App guards (`proxy.js` + `services/guard.js` + `constants/permissions.js`)
  — route + action authorization with the SAME permission map on client and server.

**4. Redux is a client cache, never the source of truth.**
- Server components render from DB reads; Redux receives data via props +
  `SessionSync`, thunks, and realtime events. Authorization NEVER reads Redux.
- `filterSlice` feeds fetch arguments (optionally mirrored to URL search params
  for shareable views).
- See "Redux ↔ Supabase sync" in IMPLEMENTATION_BLUEPRINT.md §0.4.

**5. Naming.** `*-actions.js` ('use server'), `*-service.js` (server-only),
components PascalCase, slices camelCase files exporting actions + selectors.

**6. Module 5 (Leave) is excluded everywhere**: no leave tables/statuses, the
attendance-rate formula drops the on-leave term, payroll has no unpaid-leave
deduction, and the AI has no leave tools. Re-adding it later = one migration
(extend `attendance_status` + new tables) plus new services/actions — nothing
existing needs rewriting.
