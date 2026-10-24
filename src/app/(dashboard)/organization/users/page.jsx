import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import UsersManager from './users-manager';

/** Checklist 05 — Admin creates HR logins, deactivates or resets any login. */
export default async function UsersPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/dashboard');

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, created_at')
    .order('created_at', { ascending: true });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Users & logins"
        subtitle="Create HR or Employee logins, reset passwords, deactivate accounts. New logins get a temporary password that must be changed on first sign-in."
      />
      <Card>
        <UsersManager profiles={profiles ?? []} currentUserId={profile.id} />
      </Card>
    </div>
  );
}
