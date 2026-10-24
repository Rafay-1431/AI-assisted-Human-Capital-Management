import { requireStaff } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import EmployeeForm from './employee-form';

/** Checklist 06 — HR registers an employee; this creates their login. */
export default async function NewEmployeePage() {
  const { supabase } = await requireStaff();
  const [{ data: departments }, { data: designations }] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('designations').select('id, title').order('title'),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Register employee"
        subtitle="Creates the employee's login with a temporary password — they must change it at first sign-in."
      />
      <Card>
        <EmployeeForm
          departments={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
          designations={(designations ?? []).map((d) => ({ value: d.id, label: d.title }))}
        />
      </Card>
    </div>
  );
}
