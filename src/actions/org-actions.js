'use server';

/**
 * org-actions — M2 Organization Setup (Admin manages; HR views).
 * Every mutation re-checks role server-side (assertRole), writes an audit
 * entry, and revalidates the affected screens.
 */

import { revalidatePath } from 'next/cache';
import { assertRole, withAction } from '@/services/guard';

async function audit(session, action, entity, entityId, after) {
  await session.supabase.rpc('log_audit', {
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId ?? null,
    p_after: after ?? null,
  });
}

/* ── Departments ─────────────────────────────────────────────────────────── */

export async function saveDepartmentAction({ id, name, description }) {
  return withAction(async () => {
    const session = await assertRole('admin');
    if (!name || name.trim().length < 2) {
      throw Object.assign(new Error('Department name is required.'), { code: 'VALIDATION' });
    }

    const payload = { name: name.trim(), description: description?.trim() || null };
    const query = session.supabase.from('departments');
    const { data, error } = id
      ? await query.update(payload).eq('id', id).select('id').single()
      : await query.insert(payload).select('id').single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });

    await audit(session, id ? 'department.update' : 'department.create', 'department', data.id, payload);
    revalidatePath('/organization/departments');
    return {};
  });
}

export async function deleteDepartmentAction(id) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const { error } = await session.supabase.from('departments').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });
    await audit(session, 'department.delete', 'department', id);
    revalidatePath('/organization/departments');
    return {};
  });
}

/* ── Designations ────────────────────────────────────────────────────────── */

export async function saveDesignationAction({ id, title, description }) {
  return withAction(async () => {
    const session = await assertRole('admin');
    if (!title || title.trim().length < 2) {
      throw Object.assign(new Error('Designation title is required.'), { code: 'VALIDATION' });
    }

    const payload = { title: title.trim(), description: description?.trim() || null };
    const query = session.supabase.from('designations');
    const { data, error } = id
      ? await query.update(payload).eq('id', id).select('id').single()
      : await query.insert(payload).select('id').single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });

    await audit(session, id ? 'designation.update' : 'designation.create', 'designation', data.id, payload);
    revalidatePath('/organization/designations');
    return {};
  });
}

export async function deleteDesignationAction(id) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const { error } = await session.supabase.from('designations').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });
    await audit(session, 'designation.delete', 'designation', id);
    revalidatePath('/organization/designations');
    return {};
  });
}

/* ── Holidays ────────────────────────────────────────────────────────────── */

export async function addHolidayAction({ holidayDate, title }) {
  return withAction(async () => {
    const session = await assertRole('admin');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate ?? '') || !title || title.trim().length < 2) {
      throw Object.assign(new Error('Valid date and title are required.'), { code: 'VALIDATION' });
    }

    const { data, error } = await session.supabase
      .from('holidays')
      .insert({ holiday_date: holidayDate, title: title.trim() })
      .select('id')
      .single();
    if (error) {
      const msg = error.code === '23505' ? 'A holiday on that date already exists.' : error.message;
      throw Object.assign(new Error(msg), { code: error.code ?? 'DB_FAILED' });
    }

    await audit(session, 'holiday.create', 'holiday', data.id, { holidayDate, title });
    revalidatePath('/organization/holidays');
    return {};
  });
}

export async function deleteHolidayAction(id) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const { error } = await session.supabase.from('holidays').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });
    await audit(session, 'holiday.delete', 'holiday', id);
    revalidatePath('/organization/holidays');
    return {};
  });
}

/* ── Company settings ────────────────────────────────────────────────────── */

export async function updateSettingsAction(payload) {
  return withAction(async () => {
    const session = await assertRole('admin');

    const update = {
      company_name: String(payload.companyName ?? '').trim(),
      office_start_time: payload.officeStart || '09:00',
      grace_minutes: Math.min(120, Math.max(0, Number(payload.graceMinutes) || 0)),
      half_day_threshold_hours: Math.max(1, Number(payload.halfDayThresholdHours) || 5),
      weekend_days: (payload.weekendDays ?? [0, 6]).map(Number),
      office_latitude: payload.officeLatitude === '' || payload.officeLatitude == null ? null : Number(payload.officeLatitude),
      office_longitude: payload.officeLongitude === '' || payload.officeLongitude == null ? null : Number(payload.officeLongitude),
      office_radius_m: Math.max(10, Number(payload.officeRadiusM) || 150),
      timezone: payload.timezone || 'Asia/Karachi',
    };
    if (!update.company_name) {
      throw Object.assign(new Error('Company name is required.'), { code: 'VALIDATION' });
    }

    const { error } = await session.supabase.from('company_settings').update(update).eq('id', 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });

    await audit(session, 'settings.update', 'company_settings', null, update);
    revalidatePath('/organization/settings');
    return {};
  });
}

/* ── Tax slabs (Admin replaces the whole table atomically) ───────────────── */

export async function saveTaxSlabsAction(slabs) {
  return withAction(async () => {
    const session = await assertRole('admin');

    const rows = (slabs ?? [])
      .map((s, i) => ({
        min_amount: Number(s.min_amount),
        max_amount: s.max_amount === '' || s.max_amount == null ? null : Number(s.max_amount),
        rate_pct: Number(s.rate_pct),
        flat_amount: Number(s.flat_amount) || 0,
        sort_order: i + 1,
      }))
      .filter((s) => Number.isFinite(s.min_amount) && Number.isFinite(s.rate_pct));

    if (rows.length === 0) {
      throw Object.assign(new Error('At least one slab is required.'), { code: 'VALIDATION' });
    }
    for (const s of rows) {
      if (s.max_amount != null && s.max_amount <= s.min_amount) {
        throw Object.assign(new Error('Each slab maximum must be greater than its minimum.'), { code: 'VALIDATION' });
      }
    }

    const del = await session.supabase.from('tax_slabs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del.error) throw Object.assign(new Error(del.error.message), { code: del.error.code });
    const ins = await session.supabase.from('tax_slabs').insert(rows);
    if (ins.error) throw Object.assign(new Error(ins.error.message), { code: ins.error.code });

    await audit(session, 'tax_slabs.replace', 'tax_slab', null, { count: rows.length });
    revalidatePath('/organization/tax-slabs');
    return {};
  });
}
