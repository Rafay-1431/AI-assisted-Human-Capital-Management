import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import SlabsEditor from './slabs-editor';

export default async function TaxSlabsPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/dashboard');

  const { data: slabs } = await supabase.from('tax_slabs').select('*').order('sort_order');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tax slabs"
        subtitle="Progressive slabs applied to ANNUAL gross (monthly gross × 12); monthly tax = annual ÷ 12."
      />
      <Card>
        <SlabsEditor initialSlabs={slabs ?? []} />
      </Card>
    </div>
  );
}
