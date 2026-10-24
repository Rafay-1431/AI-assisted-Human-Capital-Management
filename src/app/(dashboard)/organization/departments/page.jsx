import { requireStaff } from '@/services/guard';
import { PageHeader, Card, EmptyState } from '@/components/ui/primitives';
import DepartmentsManager from './departments-manager';

export default async function DepartmentsPage() {
  const { supabase } = await requireStaff();

  const [{ data: departments }, { data: employees }] = await Promise.all([
    supabase.from('departments').select('*').order('name'),
    supabase.from('employees').select('department_id'),
  ]);

  const counts = {};
  for (const e of employees ?? []) {
    if (e.department_id) counts[e.department_id] = (counts[e.department_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Departments" subtitle="Company structure — Admin manages, HR views." />
      <Card>
        <DepartmentsManager
          departments={(departments ?? []).map((d) => ({ ...d, employeeCount: counts[d.id] ?? 0 }))}
        />
      </Card>
      {!departments?.length ? (
        <div className="mt-4"><EmptyState title="No departments yet" hint="Add your first department above." /></div>
      ) : null}
    </div>
  );
}
