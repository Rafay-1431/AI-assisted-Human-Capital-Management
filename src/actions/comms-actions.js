'use server';

/**
 * comms-actions — M9: announcements (staff post, author/admin delete),
 * notifications (own, mark-read), audit log is read-only in its page.
 */

import { revalidatePath } from 'next/cache';
import { assertUser, assertStaff, assertRole, withAction } from '@/services/guard';

export async function postAnnouncementAction({ title, body, audience = 'all' }) {
  return withAction(async () => {
    const session = await assertStaff();
    if (!title || title.trim().length < 3 || !body || body.trim().length < 3) {
      throw Object.assign(new Error('Title and body must be at least 3 characters.'), { code: 'VALIDATION' });
    }

    const { data, error } = await session.supabase
      .from('announcements')
      .insert({ title: title.trim(), body: body.trim(), audience, posted_by: session.user.id })
      .select('id')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });

    // Notify the targeted audience in-app as well.
    if (audience === 'all') {
      await session.supabase.rpc('notify_role', { p_role: 'employee', p_type: 'announcement', p_title: 'New announcement', p_body: title.trim(), p_link: '/announcements' });
    }
    await session.supabase.rpc('log_audit', {
      p_action: 'announcement.create',
      p_entity: 'announcement',
      p_entity_id: data.id,
      p_after: { title: title.trim(), audience },
    });
    revalidatePath('/announcements');
    revalidatePath('/dashboard');
    return {};
  });
}

export async function deleteAnnouncementAction(id) {
  return withAction(async () => {
    const session = await assertStaff();
    const { error } = await session.supabase.from('announcements').delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code ?? 'DB_FAILED' });
    await session.supabase.rpc('log_audit', {
      p_action: 'announcement.delete',
      p_entity: 'announcement',
      p_entity_id: id,
    });
    revalidatePath('/announcements');
    return {};
  });
}

export async function markAllNotificationsReadAction() {
  return withAction(async () => {
    const session = await assertUser();
    const { error } = await session.supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false);
    if (error) throw Object.assign(new Error(error.message), { code: 'DB_FAILED' });
    revalidatePath('/notifications');
    return {};
  });
}

/** Paged audit feed for the Admin screen. */
export async function listAuditLogsAction({ page = 1, pageSize = 20 } = {}) {
  return withAction(async () => {
    const session = await assertRole('admin');
    const from = (Math.max(1, page) - 1) * pageSize;
    const { data, count, error } = await session.supabase
      .from('audit_logs')
      .select('id, created_at, action, entity, entity_id, actor_role, actor:profiles(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw Object.assign(new Error(error.message), { code: 'QUERY_FAILED' });
    return { rows: data ?? [], total: count ?? 0, page: Math.max(1, page), pageSize };
  });
}
