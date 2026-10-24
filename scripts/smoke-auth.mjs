/**
 * E2E smoke harness (dev tooling, not shipped UI).
 *   node --env-file=.env scripts/smoke-auth.mjs up
 *   node --env-file=.env scripts/smoke-auth.mjs down
 *
 * "up"   — creates disposable Admin + Employee test accounts (and a test
 *          department), signs them in via @supabase/ssr to produce real auth
 *          cookies for curl, and exercises web_check_in as the employee.
 * "down" — deletes the test users (cascades profile/employee/attendance) and
 *          the test department.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { writeFileSync, rmSync } from 'node:fs';

const ADMIN_EMAIL = 'hcm-test-admin@example.com';
const EMP_EMAIL = 'hcm-test-employee@example.com';
const PASSWORD = 'HcmTest!2026';
const DEPT_NAME = 'QA Test Dept';
const COOKIE_ADMIN = '.smoke/cookies-admin.txt';
const COOKIE_EMP = '.smoke/cookies-employee.txt';
const EMPLOYEE_ID_FILE = '.smoke/employee-id.txt';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;
}

async function loginCookies(email, password) {
  const jar = new Map();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function up() {
  // idempotent: remove leftovers first
  await down({ quiet: true });

  const { data: dept, error: deptError } = await admin
    .from('departments')
    .insert({ name: DEPT_NAME, description: 'temporary — e2e smoke test' })
    .select('id')
    .single();
  if (deptError) throw new Error('dept: ' + deptError.message);

  const { data: adminUser, error: e1 } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (e1) throw new Error('admin user: ' + e1.message);
  const { error: p1 } = await admin.from('profiles').insert({ id: adminUser.user.id, email: ADMIN_EMAIL, full_name: 'Test Admin', role: 'admin' });
  if (p1) throw new Error('admin profile: ' + p1.message);

  const { data: empUser, error: e2 } = await admin.auth.admin.createUser({
    email: EMP_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (e2) throw new Error('employee user: ' + e2.message);
  const { error: p2 } = await admin.from('profiles').insert({ id: empUser.user.id, email: EMP_EMAIL, full_name: 'Test Employee', role: 'employee', must_change_password: false });
  if (p2) throw new Error('employee profile: ' + p2.message);

  // employees row via admin client (RLS is bypassed; mirrors HR's insert)
  const { data: employee, error: e3 } = await admin
    .from('employees')
    .insert({
      user_id: empUser.user.id, employee_code: 'TEST-001', department_id: dept.id,
      join_date: new Date().toISOString().slice(0, 10), basic_salary: 80000, employment_status: 'active',
    })
    .select('id')
    .single();
  if (e3) throw new Error('employee row: ' + e3.message);

  // Exercise M4 as the employee: server-stamped check-in via the definer rpc
  const emp = createClient(url, anon);
  const { error: loginError } = await emp.auth.signInWithPassword({ email: EMP_EMAIL, password: PASSWORD });
  if (loginError) throw new Error('employee login: ' + loginError.message);
  const { data: checkIn, error: ciError } = await emp.rpc('web_check_in', { p_source: 'web' });
  if (ciError) throw new Error('web_check_in: ' + JSON.stringify(ciError));
  const { error: dupError } = await emp.rpc('web_check_in', { p_source: 'web' });
  console.log('check-in ok:', checkIn?.id, '| status:', checkIn?.status);
  console.log('second check-in correctly rejected:', dupError?.code ?? dupError?.message);

  writeFileSync(COOKIE_ADMIN, await loginCookies(ADMIN_EMAIL, PASSWORD));
  writeFileSync(COOKIE_EMP, await loginCookies(EMP_EMAIL, PASSWORD));
  writeFileSync(EMPLOYEE_ID_FILE, employee.id);
  console.log('cookies written:', COOKIE_ADMIN, COOKIE_EMP);
}

async function down({ quiet = false } = {}) {
  for (const email of [ADMIN_EMAIL, EMP_EMAIL]) {
    const user = await findUserByEmail(email);
    if (user) await admin.auth.admin.deleteUser(user.id); // cascades profile→employees→attendance
  }
  await admin.from('departments').delete().eq('name', DEPT_NAME);
  rmSync(COOKIE_ADMIN, { force: true });
  rmSync(COOKIE_EMP, { force: true });
  rmSync(EMPLOYEE_ID_FILE, { force: true });
  if (!quiet) console.log('test data removed');
}

const mode = process.argv[2] ?? 'up';
if (mode === 'up') await up();
else if (mode === 'down') await down();
else throw new Error('usage: smoke-auth.mjs up|down');
