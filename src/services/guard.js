import 'server-only';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server-side authn/authz guards.
 *
 * Two families:
 *   require*  — for Server Components; REDIRECT on failure (renders a clean
 *               bounce instead of an error page).
 *   assert*   — for Server Actions; THROW ActionError, which the action
 *               catches and converts to { ok: false, error: { code, message } }.
 *
 * Every action re-validates role + scope here. RLS remains the backstop for
 * data access, but these guards own business authorization ("HR may approve
 * corrections") that RLS cannot express.
 */

export class ActionError extends Error {
  /**
   * @param {string} code machine-readable (e.g. 'FORBIDDEN')
   * @param {string} [message] human-readable
   */
  constructor(code, message) {
    super(message ?? code);
    this.name = 'ActionError';
    this.code = code;
  }
}

/** Null-safe session read. Returns null when unauthenticated. */
export async function getSession() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, must_change_password')
    .eq('id', user.id)
    .single();

  return { supabase, user, profile };
}

/* ── require* family (Server Components → redirect) ─────────────────────── */

export async function requireUser() {
  const session = await getSession();
  if (!session?.profile) redirect('/login');
  if (!session.profile.is_active) redirect('/login?error=inactive');
  if (session.profile.must_change_password) redirect('/change-password');
  return session;
}

export async function requireStaff() {
  const session = await requireUser();
  if (!['admin', 'hr'].includes(session.profile.role)) redirect('/dashboard');
  return session;
}

export async function requireRole(role) {
  const session = await requireUser();
  if (session.profile.role !== role) redirect('/dashboard');
  return session;
}

/** Server components that need the signed-in user's employee row. */
export async function requireEmployee() {
  const session = await requireUser();
  const { data: employee } = await session.supabase
    .from('employees')
    .select('id, employee_code')
    .eq('user_id', session.user.id)
    .single();
  if (!employee) redirect('/dashboard');
  return { ...session, employeeId: employee.id, employeeCode: employee.employee_code };
}

/* ── assert* family (Server Actions → ActionError) ──────────────────────── */

export async function assertUser() {
  const session = await getSession();
  if (!session?.profile) throw new ActionError('UNAUTHENTICATED', 'Please sign in.');
  if (!session.profile.is_active) throw new ActionError('INACTIVE', 'Account is deactivated.');
  return session;
}

export async function assertStaff() {
  const session = await assertUser();
  if (!['admin', 'hr'].includes(session.profile.role)) {
    throw new ActionError('FORBIDDEN', 'You do not have permission for this action.');
  }
  return session;
}

export async function assertRole(role) {
  const session = await assertUser();
  if (session.profile.role !== role) {
    throw new ActionError('FORBIDDEN', 'You do not have permission for this action.');
  }
  return session;
}

export async function assertEmployee() {
  const session = await assertUser();
  const { data: employee } = await session.supabase
    .from('employees')
    .select('id, employee_code')
    .eq('user_id', session.user.id)
    .single();
  if (!employee) {
    throw new ActionError('NO_EMPLOYEE_PROFILE', 'No employee record is linked to this account.');
  }
  return { ...session, employeeId: employee.id, employeeCode: employee.employee_code };
}

/**
 * Standard try/catch wrapper for server actions: converts ActionError to a
 * serializable failure and rethrows unexpected errors after logging them.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ok: true} & T | {ok: false, error: {code: string, message: string}}>}
 */
export async function withAction(fn) {
  try {
    const data = await fn();
    return { ok: true, ...data };
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    console.error('[action-error]', error);
    return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } };
  }
}
