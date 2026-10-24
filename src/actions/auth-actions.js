'use server';

/**
 * auth-actions — M1 session + account actions.
 * Every action returns a serializable { ok, ... } object (they are called
 * from Redux thunks and client components).
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession, assertUser, assertRole, withAction } from '@/services/guard';

/** Minimal profile shape returned to the client (no timestamps bloat). */
function toClientProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
  };
}

/** Read the current session without side effects (used by SessionSync/init). */
export async function getSessionAction() {
  const session = await getSession();
  if (!session?.profile) return { ok: false };
  return { ok: true, user: { id: session.user.id, email: session.user.email }, profile: toClientProfile(session.profile) };
}

export async function signInAction({ email, password }) {
  return withAction(async () => {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw Object.assign(new Error('Invalid email or password.'), { code: 'BAD_CREDENTIALS' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!profile) throw Object.assign(new Error('Account is not provisioned yet.'), { code: 'NO_PROFILE' });
    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw Object.assign(new Error('This account has been deactivated.'), { code: 'INACTIVE' });
    }

    return { user: { id: data.user.id, email: data.user.email }, profile: toClientProfile(profile) };
  });
}

export async function signOutAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true };
}

/** Temp-password flow: change password + clear the must_change_password flag. */
export async function changePasswordAction({ newPassword }) {
  return withAction(async () => {
    const session = await assertUser();
    if (!newPassword || newPassword.length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters.'), { code: 'WEAK_PASSWORD' });
    }

    const { error } = await session.supabase.auth.updateUser({ password: newPassword });
    if (error) throw Object.assign(new Error(error.message), { code: 'UPDATE_FAILED' });

    // Allowed by trg_profiles_guard_update: self-clearing the flag only.
    await session.supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', session.user.id);

    await session.supabase.rpc('log_audit', {
      p_action: 'auth.change_password',
      p_entity: 'profile',
      p_entity_id: session.user.id,
    });

    revalidatePath('/change-password');
    return {};
  });
}

/**
 * First-run setup (checklist 01): creates the company + first Admin.
 * Guarded server-side: refuses if any profile already exists.
 */
export async function setupCompanyAction(input) {
  return withAction(async () => {
    const admin = getSupabaseAdminClient();

    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) {
      throw Object.assign(new Error('Setup already completed.'), { code: 'ALREADY_INITIALIZED' });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.adminEmail,
      password: input.adminPassword,
      email_confirm: true,
    });
    if (createError) {
      throw Object.assign(new Error(createError.message), { code: 'CREATE_ADMIN_FAILED' });
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      email: input.adminEmail,
      full_name: input.adminName,
      role: 'admin',
    });
    if (profileError) {
      // Roll the auth user back so /setup can be retried cleanly.
      await admin.auth.admin.deleteUser(created.user.id);
      throw Object.assign(new Error(profileError.message), { code: 'PROFILE_FAILED' });
    }

    const { error: settingsError } = await admin.from('company_settings').insert({
      id: 1,
      company_name: input.companyName,
      office_start_time: input.officeStart ?? '09:00',
      grace_minutes: input.graceMinutes ?? 15,
      weekend_days: input.weekendDays ?? [0, 6],
      office_latitude: input.officeLatitude ?? null,
      office_longitude: input.officeLongitude ?? null,
      office_radius_m: input.officeRadiusM ?? 150,
      is_setup_complete: true,
    });
    if (settingsError) {
      throw Object.assign(new Error(settingsError.message), { code: 'SETTINGS_FAILED' });
    }

    return {};
  });
}

/* ── Admin user management (checklist 05) ────────────────────────────────── */

function generateTempPassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  return `Hcm@${base}1`; // satisfies typical complexity rules
}

/** Admin creates an HR or Employee LOGIN (employee job record is M3's flow). */
export async function createUserLoginAction({ email, fullName, role }) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const admin = getSupabaseAdminClient();
    const tempPassword = generateTempPassword();

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error) throw Object.assign(new Error(error.message), { code: 'CREATE_FAILED' });

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      email,
      full_name: fullName,
      role, // 'hr' or 'employee' — Admins are only created by first-run setup
      must_change_password: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw Object.assign(new Error(profileError.message), { code: 'PROFILE_FAILED' });
    }

    await session.supabase.rpc('log_audit', {
      p_action: 'user.create',
      p_entity: 'profile',
      p_entity_id: created.user.id,
      p_after: { email, role },
    });

    // The temp password is returned ONCE for the Admin to hand over securely.
    return { userId: created.user.id, tempPassword };
  });
}

/** Admin resets any login to a new temp password (must change on first sign-in). */
export async function resetUserPasswordAction(userId) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const admin = getSupabaseAdminClient();
    const tempPassword = generateTempPassword();

    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });
    if (error) throw Object.assign(new Error(error.message), { code: 'RESET_FAILED' });

    await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
    await session.supabase.rpc('log_audit', {
      p_action: 'user.reset_password',
      p_entity: 'profile',
      p_entity_id: userId,
    });

    return { tempPassword };
  });
}

/** Admin (de)activates a login. Deactivated users are blocked by the proxy + RLS. */
export async function setUserActiveAction(userId, isActive) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const admin = getSupabaseAdminClient();

    const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', userId);
    if (error) throw Object.assign(new Error(error.message), { code: 'UPDATE_FAILED' });

    if (!isActive) {
      // Optional hard ban; profile flag is already sufficient for the proxy.
      await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    } else {
      await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    }

    await session.supabase.rpc('log_audit', {
      p_action: isActive ? 'user.activate' : 'user.deactivate',
      p_entity: 'profile',
      p_entity_id: userId,
      p_after: { is_active: isActive },
    });

    revalidatePath('/organization/users');
    return {};
  });
}

/** Convenience redirect used by the login page after successful sign-in. */
export async function completeSignInRedirect(nextPath) {
  redirect(nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard');
}
