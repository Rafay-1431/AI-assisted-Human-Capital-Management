import { requireUser } from '@/services/guard';
import { PageHeader, Card, Badge, btn } from '@/components/ui/primitives';
import AnnouncementComposer from './announcement-composer';
import DeleteButton from './delete-button';

/** Announcements (checklist 23): staff posts, everyone reads (RLS scopes audience). */
export default async function AnnouncementsPage() {
  const { profile, user, supabase } = await requireUser();
  const isStaff = profile.role === 'admin' || profile.role === 'hr';

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, audience, created_at, posted_by, author:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Announcements" subtitle={isStaff ? 'Publish to all employees or just the HR team.' : 'Company updates from Admin and HR.'} />

      {isStaff ? (
        <Card className="mb-6"><AnnouncementComposer /></Card>
      ) : null}

      <div className="space-y-4">
        {!announcements?.length ? (
          <Card className="text-center text-sm text-gray-500">No announcements yet.</Card>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{a.title}</h2>
                  <p className="mt-1 text-xs text-gray-400">
                    {a.author?.full_name ?? '—'} · {new Date(a.created_at).toLocaleDateString('en-GB')} ·{' '}
                    <Badge tone={a.audience === 'all' ? 'teal' : 'violet'}>{a.audience}</Badge>
                  </p>
                </div>
                {isStaff && (a.posted_by === user.id || profile.role === 'admin') ? (
                  <DeleteButton id={a.id} />
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{a.body}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
