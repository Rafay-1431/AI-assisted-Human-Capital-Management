import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import SettingsForm from './settings-form';

export default async function OrganizationSettingsPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/dashboard');

  const { data: settings } = await supabase.from('company_settings').select('*').eq('id', 1).single();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Company settings"
        subtitle="Office hours, grace time, weekend and the camera-attendance geofence. Applies to new records only."
      />
      {settings ? (
        <Card>
          <SettingsForm settings={settings} />
        </Card>
      ) : (
        <Card>Settings missing — run first-run setup again.</Card>
      )}
    </div>
  );
}
