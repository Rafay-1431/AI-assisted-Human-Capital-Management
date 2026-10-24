import { requireStaff } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import DesignationsManager from './designations-manager';

export default async function DesignationsPage() {
  const { supabase } = await requireStaff();
  const { data: designations } = await supabase.from('designations').select('*').order('title');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Designations" subtitle="Job titles used across the directory and payroll averages." />
      <Card>
        <DesignationsManager designations={designations ?? []} />
      </Card>
    </div>
  );
}
