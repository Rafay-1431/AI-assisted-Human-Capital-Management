import { requireStaff } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import HolidaysManager from './holidays-manager';

export default async function HolidaysPage() {
  const { supabase } = await requireStaff();
  const { data: holidays } = await supabase
    .from('holidays')
    .select('*')
    .gte('holiday_date', `${new Date().getFullYear()}-01-01`)
    .order('holiday_date');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Public holidays"
        subtitle={`Non-working days for ${new Date().getFullYear()} — excluded from working days in payroll.`}
      />
      <Card>
        <HolidaysManager holidays={holidays ?? []} />
      </Card>
    </div>
  );
}
