# HCM Lite — Implementation Blueprint (Module 5 / Leave excluded)

Build order maximizes unblocked parallel work for a 4-person team
(2 backend, 2 frontend). Each phase ends with a verifiable acceptance check.
Effort assumes one focused person-day ≈ 6–8 h.

## Phase 0 — Scaffold (½ day, both pairs together)
- [ ] `npx create-next-app@latest hcm-lite --js --app --tailwind --src-dir`
- [ ] Install: `@supabase/ssr @supabase/supabase-js @reduxjs/toolkit react-redux recharts @tanstack/react-table`
- [ ] Copy in: `jsconfig.json`, `.env.example`, `src/proxy.js`, `src/lib/`,
      `src/store/`, `docs/`; create the app skeleton from PROJECT_STRUCTURE.md.
- [ ] UI primitives pass (Button, Input, Card, Dialog, Badge, Table, Skeleton,
      EmptyState) — BambooHR tone: white surfaces, teal-600 primary, gray-50
      page background, 8-pt spacing, 14 px table text.
- [ ] Create the Supabase project; put URL/keys in `.env.local`.
- ✅ Accept: `npm run dev` renders a placeholder dashboard behind the proxy.

## Phase 1 — Database (1 day, backend pair; frontend starts Phase 2 UI shells)
- [ ] Run migrations 00001–00005 in order (SQL editor or `supabase db push`).
- [ ] Smoke-test RLS with SQL as anon/authenticated: an employee token selects
      only their `employees`/`attendance`/`payslips` rows; nobody reads
      `audit_logs` except admin.
- [ ] Verify the definer RPCs fire: `web_check_in` twice → CM409; finalized run
      update → PAYROLL_RUN_IS_LOCKED.
- ✅ Accept: `supabase db lint` clean-ish; policy behavior demo-able.

## Phase 2 — M1 Auth & First-Run (1 day)
Backend: copy `services/guard.js`, `actions/auth-actions.js`; wire `/setup`
(create company + Admin via service role, guarded to run once), `/login`,
`/change-password` (temp-password flag), logout.
Frontend: setup wizard (3 steps: company → rules → office geofence), login,
change-password; mount `StoreProvider` + `SessionSync`.
- ✅ Accept: fresh install → /setup → Admin login → role menus differ per role;
  deactivated user bounced; judge can do this in < 2 minutes.

## Phase 3 — M2 Organization Setup (1–1.5 days)
Backend: `org-actions.js` + `org-service.js` (departments, designations,
holidays, tax slabs, settings update; user logins: create HR/employee accounts
with temp password, reset, deactivate — already drafted in auth-actions).
Frontend: Org pages with DataTable (sort/filter), settings form, users table.
- ✅ Accept: Admin edits everything; HR only views; Employee sees none of it.

## Phase 4 — M3 Employees (2 days)
Backend: `employee-actions.js` + `employee-service.js`: register (creates auth
login + temp password + profile + employees row), edit, 360 fetch,
server-side search/filter/paging, CSV **dry-run** validator (`csv/validator.js`:
required fields, unique code/email in-file + DB, valid email, known dept, ISO
dates, salary > 0 → errors as {row, field, reason}), export CSV.
Frontend: directory table + filters (Redux `filterSlice.directory`), Employee
360 (personal/job/payroll tabs), import wizard (upload → error report → confirm).
- ✅ Accept: HR registers employee → login works → must change password;
  dry-run shows precise row/field errors; export matches filters.

## Phase 5 — M4 Attendance (2 days, highest demo value after payroll)
Backend: already drafted (`attendance-actions.js` + RPCs). Add my-calendar +
board aggregations. Optional bonus: camera gate (face-api.js / MediaPipe in a
dialog, sends faceCount + lat/lng + accuracy; server does Haversine + rules).
Frontend: CheckInWidget (web → camera), my calendar, staff board with
department filter, corrections inbox (approve/reject modal).
- ✅ Accept: two check-ins → friendly 409; late after 09:15; half-day < 5 h;
  correction → approval updates the record and notifies the employee live.

## Phase 6 — M6 Payroll Lite (2 days)
Backend: `payroll-service.js` (already complete) + payslip PDF
(`pdf/payslip.js`, @react-pdf/renderer: company, period, earnings/deductions,
tax, net; "AI-generated" not needed; branded header).
Frontend: run wizard (pick month → preview table w/ totals → create →
finalize), runs list, payslip list + PDF download.
- ✅ Accept: HR creates draft; ONLY Admin finalizes; post-finalize edits fail
  hard; employee downloads own payslip; numbers match the formulas.

## Phase 7 — M7 Dashboards & Analytics (2 days)
Backend: `analytics-service.js` over the `v_*` views: headcount, attrition,
attendance rate/trend, late %/absenteeism by dept, payroll cost/avg salary —
all filterable by date range + department.
Frontend: KPI cards + Recharts (trend line, dept bars, donuts) per role:
Admin (company + audit feed), HR (today + pending approvals + top late-comers),
Employee (hours vs 40 h, late count, last payslip). Filters write to
`filterSlice.analytics`; "Summarize" button calls `ai-actions`.
- ✅ Accept: numbers match records created live during judging; empty states
  look designed, not broken.

## Phase 8 — M8 AI Assistant (1.5 days; backend can start after Phase 5)
Already scaffolded (`lib/ai/**`, `/api/ai/chat`, `ai-actions.js`).
- [ ] Set `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`; test both adapters.
- [ ] ChatPanel drawer (Redux `uiSlice.chatPanelOpen`); messages client-side;
      answers labeled "AI-generated"; graceful fallback + rate-limit copy.
- [ ] Dashboard summarize (JSON-validated, 1 retry, fallback to dashboard).
- [ ] Rehearse the judge questions (below).
- ✅ Accept: role-scoped answers match dashboards; employee asking for a
  colleague's salary is politely refused; provider swap is env-only.

## Phase 9 — M9 Comms & Audit (1 day)
Backend: `comms-actions.js` (announcements CRUD per role, notifications list,
mark-read) — notifications are written by the definer RPCs already.
Frontend: announcements page, notification bell + realtime toasts
(`useNotificationSync`), admin audit-log table (filter by action/entity).
- ✅ Accept: HR posts → employee sees it on dashboard without refresh.

## Phase 10 — Polish & Submission (1–1.5 days)
- [ ] Loading skeletons + empty + error states on EVERY page (UI/UX = 10 pts).
- [ ] Responsive at 375 px; dark mode via `uiSlice.theme` (+PWA if time).
- [ ] README: stack, run steps, first Admin, AI key setup, done/not-done.
- [ ] Deploy (Vercel + Supabase), commit `.env.example` only.
- [ ] Full judge dry-run from fresh DB (Figure 4 of the brief) twice.

## Team split (4 people)
| Pair | Owns |
|---|---|
| Backend A | Migrations/RLS/RPCs · payroll + attendance services · CSV/PDF |
| Backend B | Actions/services for org, employees, comms · AI tools · rate limits |
| Frontend A | Design system · DataTable · M2/M3 screens · directory/360/import |
| Frontend B | Auth screens · dashboards/charts · attendance widget · chat panel |

## Redux ↔ Supabase sync (§0.4 — how the store stays honest)
1. **Hydration**: server layouts fetch the session and pass it as props →
   `SessionSync` dispatches into `authSlice` after mount. Server HTML never
   reads Redux → no hydration mismatch.
2. **Writes**: components/thunks call server actions (e.g. `checkInAction`);
   actions re-validate role server-side, return `{ ok, ... }`, and
   `revalidatePath` refreshes RSC data; thunks update slices from the result.
3. **Realtime**: `useRealtimeChannel` (notifications, announcements,
   attendance) dispatches toasts/counters/refresh flags. Realtime respects
   RLS — users only receive events for rows they may read.
4. **Invariant**: Redux = UI/ephemeral + cache; Postgres = truth; the server
   re-checks every mutation regardless of Redux state.

## M5 (Leave) exclusion adjustments to remember
- Attendance-rate numerator/denominator: no on-leave term.
- Payroll deductions: absent + 0.5 × half-day only (no unpaid-leave term).
- AI tools: no `get_leave_summary` / `get_my_leave_balance` / smart-leave.
- `attendance_status` enum has no 'on_leave' value — re-adding Leave later is
  a forward-only migration.

## Judge dry-run checklist (maps to scoring)
- Core flows (25): login each role → register → check-in → correction →
  payroll run → finalize → payslip PDF.
- Data & analytics (20): create activity, then verify each dashboard number.
- AI (15): headcount by dept · late-comers · attendance rate · own payslip ·
  colleague salary (refused) · "I need Monday off" → out-of-scope reply.
- Code quality (15): rules in services/RPCs, guards, JSDoc, targeted tests for
  `payroll-service` (pure functions — easy vitest wins).
- Security & RBAC (10): show RLS + trigger lock + audit log in the README.
