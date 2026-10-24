'use server';

/**
 * employee-actions — M3: register (creates the login), edit, server-side
 * search/paging, CSV dry-run import + commit.
 *
 * Registration writes THREE rows: auth user (service role — auth.admin API),
 * profile (service role), employees (user-scoped client — RLS-checked as
 * staff). Failures roll the auth user back.
 */

import { revalidatePath } from 'next/cache';
import { assertStaff, assertRole, withAction } from '@/services/guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { parseCsv, validateCsvRows, ALL_COLUMNS } from '@/lib/csv/validator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  return `Hcm@${base}1`;
}

async function audit(session, action, entity, entityId, after) {
  await session.supabase.rpc('log_audit', {
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId ?? null,
    p_after: after ?? null,
  });
}

/** Server-side directory search + filters + paging (brief M3 requirement). */
export async function listEmployeesAction({ search = '', departmentId = 'all', status = 'all', page = 1, pageSize = 10 }) {
  return withAction(async () => {
    const session = await assertStaff();

    let query = session.supabase
      .from('v_employee_directory')
      .select('*', { count: 'exact' })
      .order('employee_code', { ascending: true });
    if (search) query = query.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%,email.ilike.%${search}%`);
    if (departmentId && departmentId !== 'all') query = query.eq('department_id', departmentId);
    if (status && status !== 'all') query = query.eq('employment_status', status);

    const from = (Math.max(1, page) - 1) * pageSize;
    const { data, count, error } = await query.range(from, from + pageSize - 1);
    if (error) throw Object.assign(new Error(error.message), { code: 'QUERY_FAILED' });

    return { rows: data ?? [], total: count ?? 0, page: Math.max(1, page), pageSize };
  });
}

/** HR/Admin registers an employee → creates their login + job record. */
export async function registerEmployeeAction(input) {
  return withAction(async () => {
    const session = await assertStaff();
    const admin = getSupabaseAdminClient();

    const email = String(input.email ?? '').trim().toLowerCase();
    const code = String(input.employeeCode ?? '').trim();
    const fullName = String(input.fullName ?? '').trim();
    const salary = Number(input.basicSalary);

    if (!fullName || !EMAIL_RE.test(email) || !code) {
      throw Object.assign(new Error('Name, a valid email and employee code are required.'), { code: 'VALIDATION' });
    }
    if (!input.joinDate || !Number.isFinite(salary) || salary <= 0) {
      throw Object.assign(new Error('Join date (ISO) and a salary > 0 are required.'), { code: 'VALIDATION' });
    }

    const [{ data: dupe }, { data: dupeEmail }] = await Promise.all([
      session.supabase.from('employees').select('id').eq('employee_code', code).maybeSingle(),
      session.supabase.from('profiles').select('id').eq('email', email).maybeSingle(),
    ]);
    if (dupe) throw Object.assign(new Error(`Employee code "${code}" already exists.`), { code: 'DUPLICATE_CODE' });
    if (dupeEmail) throw Object.assign(new Error(`Email "${email}" already has an account.`), { code: 'DUPLICATE_EMAIL' });

    const tempPassword = generateTempPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError) throw Object.assign(new Error(createError.message), { code: 'CREATE_LOGIN_FAILED' });

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      email,
      full_name: fullName,
      role: 'employee',
      must_change_password: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw Object.assign(new Error(profileError.message), { code: 'PROFILE_FAILED' });
    }

    const { data: employee, error: employeeError } = await session.supabase
      .from('employees')
      .insert({
        user_id: created.user.id,
        employee_code: code,
        department_id: input.departmentId || null,
        designation_id: input.designationId || null,
        join_date: input.joinDate,
        gender: input.gender || null,
        date_of_birth: input.dateOfBirth || null,
        phone: input.phone || null,
        address: input.address || null,
        basic_salary: salary,
        employment_status: input.employmentStatus || 'probation',
        created_by: session.user.id,
      })
      .select('id')
      .single();

    if (employeeError) {
      await admin.auth.admin.deleteUser(created.user.id); // cascade removes profile
      throw Object.assign(new Error(employeeError.message), { code: 'EMPLOYEE_FAILED' });
    }

    await audit(session, 'employee.create', 'employee', employee.id, { code, email });
    revalidatePath('/employees');
    return { employeeId: employee.id, tempPassword };
  });
}

/** HR/Admin edits job/contact details (employees can only edit phone/address — trigger-guarded). */
export async function updateEmployeeAction({ id, patch }) {
  return withAction(async () => {
    const session = await assertStaff();

    const allowed = ['department_id', 'designation_id', 'employment_status', 'join_date', 'exit_date', 'gender', 'date_of_birth', 'phone', 'address', 'basic_salary', 'manager_id'];
    const update = {};
    for (const key of allowed) if (patch?.[key] !== undefined) update[key] = patch[key];
    if (update.basic_salary !== undefined) {
      const salary = Number(update.basic_salary);
      if (!Number.isFinite(salary) || salary <= 0) {
        throw Object.assign(new Error('Salary must be a number > 0.'), { code: 'VALIDATION' });
      }
      update.basic_salary = salary;
    }
    if (Object.keys(update).length === 0) {
      throw Object.assign(new Error('Nothing to update.'), { code: 'VALIDATION' });
    }

    const { error } = await session.supabase.from('employees').update(update).eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });

    await audit(session, 'employee.update', 'employee', id, update);
    revalidatePath(`/employees/${id}`);
    return {};
  });
}

/* ── CSV import: dry run → confirm ───────────────────────────────────────── */

async function importContext(session) {
  const [{ data: employees }, { data: profiles }, { data: departments }] = await Promise.all([
    session.supabase.from('employees').select('employee_code'),
    session.supabase.from('profiles').select('email'),
    session.supabase.from('departments').select('name'),
  ]);
  return {
    existingCodes: (employees ?? []).map((e) => e.employee_code.toLowerCase()),
    existingEmails: (profiles ?? []).map((p) => p.email.toLowerCase()),
    departments: (departments ?? []).map((d) => d.name),
  };
}

/** Dry run — returns row/field/reason errors, writes nothing. */
export async function importPreviewAction(csvText) {
  return withAction(async () => {
    const session = await assertRole('hr');
    const parsed = parseCsv(csvText);
    if (parsed.rows.length === 0) {
      throw Object.assign(new Error('No data rows found. Include the header line: ' + ALL_COLUMNS.join(', ')), { code: 'EMPTY_CSV' });
    }
    const missing = ALL_COLUMNS.filter((c) => !parsed.headers.includes(c));
    if (missing.length > 0) {
      throw Object.assign(new Error(`Missing columns: ${missing.join(', ')}`), { code: 'MISSING_COLUMNS' });
    }
    const ctx = await importContext(session);
    const { valid, errors } = validateCsvRows(parsed.rows, ctx);
    return { totalRows: parsed.rows.length, validCount: valid.length, errorCount: errors.length, errors, validSample: valid.slice(0, 5) };
  });
}

/** Commit — creates logins + employee rows for the currently valid rows only. */
export async function importCommitAction(csvText) {
  return withAction(async () => {
    const session = await assertRole('hr');
    const admin = getSupabaseAdminClient();
    const parsed = parseCsv(csvText);
    const ctx = await importContext(session);
    const { valid, errors } = validateCsvRows(parsed.rows, ctx);

    const created = [];
    const failed = [];
    for (const row of valid) {
      const email = row.email.toLowerCase();
      const tempPassword = generateTempPassword();
      try {
        const { data: authUser, error: createError } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });
        if (createError) throw new Error(createError.message);

        const { error: profileError } = await admin.from('profiles').insert({
          id: authUser.user.id,
          email,
          full_name: row.full_name,
          role: 'employee',
          must_change_password: true,
        });
        if (profileError) {
          await admin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(profileError.message);
        }

        const dept = ctx.departments.find((d) => d.toLowerCase() === row.department.toLowerCase());
        const { data: deptRow } = await session.supabase.from('departments').select('id').eq('name', dept).single();
        let designationId = null;
        if (row.designation) {
          const { data: ds } = await session.supabase.from('designations').select('id').ilike('title', row.designation).maybeSingle();
          if (!ds) {
            const { data: newDs } = await session.supabase.from('designations').insert({ title: row.designation }).select('id').single();
            designationId = newDs?.id ?? null;
          } else designationId = ds.id;
        }

        const { error: empError } = await session.supabase.from('employees').insert({
          user_id: authUser.user.id,
          employee_code: row.employee_code,
          department_id: deptRow?.id ?? null,
          designation_id: designationId,
          join_date: row.join_date,
          gender: row.gender ? row.gender.toLowerCase() : null,
          date_of_birth: row.date_of_birth || null,
          phone: row.phone || null,
          address: row.address || null,
          basic_salary: Number(row.basic_salary),
        });
        if (empError) {
          await admin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(empError.message);
        }

        created.push({ email, code: row.employee_code, tempPassword });
      } catch (e) {
        failed.push({ row: row.full_name || email, reason: e.message });
      }
    }

    if (created.length > 0) {
      await session.supabase.rpc('log_audit', {
        p_action: 'employee.csv_import',
        p_entity: 'employee',
        p_after: { created: created.length, failed: failed.length, skipped: errors.length },
      });
    }
    revalidatePath('/employees');
    return { createdCount: created.length, failed, skippedCount: errors.length, credentials: created };
  });
}
