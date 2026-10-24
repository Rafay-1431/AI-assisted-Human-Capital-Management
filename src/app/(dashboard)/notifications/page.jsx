import Link from 'next/link';
import { requireUser } from '@/services/guard';
import { PageHeader, EmptyState, Card, Badge, btn } from '@/components/ui/primitives';
import MarkAllRead from './mark-all-read';

const TYPE_TONES = {
  correction_approved: 'green',
  correction_rejected: 'red',
  payroll_ready: 'teal',
  payroll_finalized: 'teal',
  announcement: 'violet',
  account: 'gray',
  system: 'gray',
};

/** In-app notifications (checklist 24) — own rows via RLS; realtime toasts come later. */
export default async function NotificationsPage() {
  const { supabase } = await requireUser();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" subtitle="Correction decisions, payslips and announcements land here.">
        {unread > 0 ? <MarkAllRead /> : null}
      </PageHeader>

      {!notifications?.length ? (
        <EmptyState title="No notifications" hint="Approvals, payroll and announcements will notify you." />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id} className={n.is_read ? 'opacity-60' : 'ring-teal-200'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {n.title} <Badge tone={TYPE_TONES[n.type] ?? 'gray'}>{String(n.type).replace(/_/g, ' ')}</Badge>
                  </p>
                  {n.body ? <p className="mt-1 text-sm text-gray-600">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-gray-400">{new Date(n.created_at).toLocaleString('en-GB')}</p>
                </div>
                {n.link ? (
                  <Link href={n.link} className={btn.small}>Open</Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
