/**
 * Badge attendance RPC tests (Module 4 extension).
 *   node --env-file=.env scripts/test-badge.mjs
 * Creates disposable test users, exercises every RBAC case of
 * badge_check_in / badge_check_out, then cleans up.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DEPT = 'QA Badge Dept';
const EMP1 = 'hcm-badge-emp1@example.com';
const EMP2 = 'hcm-badge-emp2@example.com';
const CODE1 = 'BADGE-001';
const CODE2 = 'BADGE-002';
const PASSWORD = 'HcmTest!2026';

/** supabase-js resolves RPC errors as values — unwrap and rethrow with the SQLSTATE code. */
function unwrap(promise) {
  return promise.then((r) => {
    if (r.error) {
      const e = new Error(r.error.message);
      e.code = r.error.code ?? 'UNKNOWN';
      throw e;
    }
    return r.data;
  });
}

function report(label, dataPromise) {
  return dataPromise.then(
    (v) => console.log('PASS ', label, v ? JSON.stringify(v).slice(0, 90) : ''),
    (e) => console.log('FAIL ', label, e.code ? `${e.code}: ${String(e.message).slice(0, 90)}` : String(e.message).slice(0, 120)),
  );
}

function expectError(label, dataPromise, code) {
  return dataPromise.then(
    () => console.log('FAIL ', label, `(expected error ${code}, got success)`),
    (e) => console.log(e.code === code ? `PASS  ${label} (${code})` : `FAIL  ${label} expected ${code}, got ${e.code}: ${String(e.message).slice(0, 80)}`),
  );
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) {
    if ([EMP1, EMP2, 'hcm-badge-staff@example.com'].includes(u.email?.toLowerCase())) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await admin.from('departments').delete().eq('name', DEPT);
}

async function setup() {
  await cleanup();
  const { data: dept } = await admin.from('departments').insert({ name: DEPT }).select('id').single();
  for (const [email, code, name] of [[EMP1, CODE1, 'Badge One'], [EMP2, CODE2, 'Badge Two']]) {
    const { data: u, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    await admin.from('profiles').insert({ id: u.user.id, email, full_name: name, role: 'employee' });
    await admin.from('employees').insert({ user_id: u.user.id, employee_code: code, department_id: dept.id, join_date: new Date().toISOString().slice(0, 10), basic_salary: 60000, employment_status: 'active' });
  }
  const { data: staffU } = await admin.auth.admin.createUser({ email: 'hcm-badge-staff@example.com', password: PASSWORD, email_confirm: true });
  await admin.from('profiles').insert({ id: staffU.user.id, email: 'hcm-badge-staff@example.com', full_name: 'Badge Staff', role: 'hr' });
}

async function userClient(email) {
  const c = createClient(url, anon);
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error('login ' + email + ': ' + error.message);
  return c;
}

await cleanup();
await setup();
const emp1 = await userClient(EMP1);
const emp2 = await userClient(EMP2);
const staff = await userClient('hcm-badge-staff@example.com');

await report('employee self badge check-in (status derived)', unwrap(emp1.rpc('badge_check_in', { p_employee_code: CODE1 })).then((d) => ({ status: d.status, source: d.check_in_source })));
await expectError('employee scanning ANOTHER badge → forbidden', unwrap(emp2.rpc('badge_check_in', { p_employee_code: CODE1 })), 'CM403');
await expectError('unknown badge → not found', unwrap(emp1.rpc('badge_check_in', { p_employee_code: 'NOPE-999' })), 'CM404');
await expectError('duplicate check-in → 409', unwrap(emp1.rpc('badge_check_in', { p_employee_code: CODE1 })), 'CM409');
await expectError('staff re-check-in same badge → 409', unwrap(staff.rpc('badge_check_in', { p_employee_code: CODE1 })), 'CM409');
await report('staff badge check-out of employee', unwrap(staff.rpc('badge_check_out', { p_employee_code: CODE1 })).then((d) => ({ status: d.status, checkedOut: !!d.check_out_at })));
await expectError('duplicate check-out → CM410', unwrap(staff.rpc('badge_check_out', { p_employee_code: CODE1 })), 'CM410');
await expectError('check-out with no open record → CM410', unwrap(emp2.rpc('badge_check_out', { p_employee_code: CODE2 })), 'CM410');
await report('employee self badge check-in (second employee)', unwrap(emp2.rpc('badge_check_in', { p_employee_code: CODE2 })).then((d) => ({ status: d.status })));

await cleanup();
console.log('done — test data removed');
