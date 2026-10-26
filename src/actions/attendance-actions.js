'use server';

/**
 * attendance-actions — M4. Thin orchestration layer: guard → rpc/RLS-scoped
 * query → map error codes to friendly copy → revalidate.
 * All RULES live in the SECURITY DEFINER rpcs (web_check_in/out,
 * review_correction) so they cannot be bypassed from the client.
 */

import { revalidatePath } from 'next/cache';
import { assertUser, assertEmployee, assertStaff, withAction } from '@/services/guard';

const RPC_ERROR_COPY = {
  CM401: 'Your account is inactive.',
  CM402: 'No employee profile is linked to your account.',
  CM403: 'You can only scan your own badge.',
  CM404: 'Badge not recognized — check the code and try again.',
  CM409: 'You have already checked in today.',
  CM410: 'No open check-in found for today.',
  CM422: 'Face check failed — exactly one face must be visible in frame.',
  CM423: 'GPS accuracy is too low. Step outside or disable camera mode.',
  CM424: 'You appear to be outside the office radius.',
  CM425: 'Office location is not configured yet — use web check-in.',
};

function mapRpcError(rpcError) {
  const code = rpcError?.code ?? 'UNKNOWN';
  return {
    code,
    message: RPC_ERROR_COPY[code] ?? rpcError?.message ?? 'Something went wrong.',
  };
}

/** Today's row for the signed-in employee (company-timezone "today"). */
export async function getMyTodayAction() {
  return withAction(async () => {
    const session = await assertEmployee();

    const { data: today } = await session.supabase.rpc('local_today');
    const { data: attendance } = await session.supabase
      .from('attendance')
      .select('id, work_date, check_in_at, check_out_at, status, check_in_source')
      .eq('employee_id', session.employeeId)
      .eq('work_date', today)
      .maybeSingle();

    return { attendance };
  });
}

/**
 * @param {{ source?: 'web'|'camera', lat?: number, lng?: number,
 *           accuracyM?: number, faceCount?: number }} [payload]
 */
export async function checkInAction(payload = {}) {
  return withAction(async () => {
    const session = await assertEmployee();

    const { data, error } = await session.supabase.rpc('web_check_in', {
      p_source: payload.source ?? 'web',
      p_lat: payload.lat ?? null,
      p_lng: payload.lng ?? null,
      p_accuracy_m: payload.accuracyM ?? null,
      p_face_count: payload.faceCount ?? null,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'RPC_FAILED' });

    revalidatePath('/attendance/my');
    revalidatePath('/attendance/board');
    return { attendance: data };
  });
}

export async function checkOutAction(payload = {}) {
  return withAction(async () => {
    const session = await assertEmployee();

    const { data, error } = await session.supabase.rpc('web_check_out', {
      p_source: payload.source ?? 'web',
      p_lat: payload.lat ?? null,
      p_lng: payload.lng ?? null,
      p_accuracy_m: payload.accuracyM ?? null,
      p_face_count: payload.faceCount ?? null,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'RPC_FAILED' });

    revalidatePath('/attendance/my');
    revalidatePath('/attendance/board');
    return { attendance: data };
  });
}

/** Employee requests a correction (RLS: own rows only, status 'pending'). */
export async function submitCorrectionAction({ workDate, checkIn, checkOut, reason }) {
  return withAction(async () => {
    const session = await assertEmployee();
    if (!reason || reason.trim().length < 3) {
      throw Object.assign(new Error('Please describe the reason (min 3 characters).'), {
        code: 'VALIDATION',
      });
    }

    const { data, error } = await session.supabase
      .from('attendance_corrections')
      .insert({
        employee_id: session.employeeId,
        work_date: workDate,
        requested_check_in: checkIn || null,
        requested_check_out: checkOut || null,
        reason: reason.trim(),
      })
      .select('id')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: 'INSERT_FAILED' });

    await session.supabase.rpc('log_audit', {
      p_action: 'correction.request',
      p_entity: 'attendance_correction',
      p_entity_id: data.id,
      p_after: { work_date: workDate },
    });

    revalidatePath('/attendance/corrections');
    return { correctionId: data.id };
  });
}

/** HR/Admin approve or reject (rules + notifications inside review_correction). */
export async function reviewCorrectionAction({ correctionId, approve, comment }) {  return withAction(async () => {
    const session = await assertStaff();

    const { data, error } = await session.supabase.rpc('review_correction', {
      p_correction_id: correctionId,
      p_approve: Boolean(approve),
      p_comment: comment ?? null,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'RPC_FAILED' });

    revalidatePath('/attendance/corrections');
    revalidatePath('/attendance/board');
    return { correction: data };
  });
}

/**
 * Daily attendance board (staff). Server-side filtering per the brief
 * ("Server-side search, filters, paging" pattern applied to attendance).
 * @param {{ date?: string, departmentId?: string }} [filters]
 */
export async function getAttendanceBoardAction(filters = {}) {
  return withAction(async () => {
    const session = await assertStaff();

    let query = session.supabase
      .from('attendance')
      .select(
        'id, work_date, check_in_at, check_out_at, status, ' +
          'employee:employees(id, employee_code, department_id, department:departments(name), ' +
          'user:profiles(full_name))',
      )
      .order('check_in_at', { ascending: true, nullsFirst: false });

    query = filters.date ? query.eq('work_date', filters.date) : query.eq('work_date', (await session.supabase.rpc('local_today')).data);

    const { data, error } = await query;
    if (error) throw Object.assign(new Error(error.message), { code: 'QUERY_FAILED' });

    const rows = (data ?? []).filter(
      (r) => filters.departmentId && filters.departmentId !== 'all'
        ? r.employee?.department_id === filters.departmentId
        : true,
    );
    return { rows };
  });
}

/* ── Badge QR attendance (M4 extension) ────────────────────────────────────
 * The badge RPC enforces RBAC server-side: staff may scan any badge,
 * employees only their own. The caller never picks WHO — only the badge does.
 */

async function badgeResult(session, mode, employeeCode) {
  const rpcName = mode === 'out' ? 'badge_check_out' : 'badge_check_in';
  const { data, error } = await session.supabase.rpc(rpcName, {
    p_employee_code: String(employeeCode ?? '').trim(),
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'RPC_FAILED' });

  // Resolve the employee for the success toast (RLS scopes the read).
  const { data: emp } = await session.supabase
    .from('v_employee_directory')
    .select('full_name, employee_code')
    .eq('employee_code', String(employeeCode ?? '').trim())
    .maybeSingle();

  return {
    attendance: data,
    employeeName: emp?.full_name ?? employeeCode,
    employeeCode: emp?.employee_code ?? employeeCode,
  };
}

/**
 * @param {{ employeeCode: string, mode?: 'in'|'out' }} payload
 * @returns {{ ok, attendance, employeeName, employeeCode }} — serializable
 * for the scanner's toast (times as ISO strings).
 */
export async function badgeScanAction({ employeeCode, mode = 'in' }) {
  return withAction(async () => {
    const session = await (mode === 'out' ? assertStaff() : assertUser());
    const result = await badgeResult(session, mode, employeeCode);
    revalidatePath('/attendance/my');
    revalidatePath('/attendance/board');
    revalidatePath('/attendance');
    return result;
  });
}
