import { requireEmployee } from '@/services/guard';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui/primitives';
import { BadgePageCard } from '@/components/employees/id-badge';

/**
 * The signed-in employee's digital ID badge (print-friendly).
 * Company name is read with the admin client because employees cannot select
 * company_settings — a read-only, server-side infrastructure use (same as the
 * payslip PDF route).
 */
export default async function MyBadgePage() {
  const { employeeId, supabase } = await requireEmployee();

  const [{ data: me }, { data: settings }] = await Promise.all([
    supabase
      .from('employees')
      .select('employee_code, designation:designations(title), department:departments!employees_department_id_fkey(name), user:profiles!employees_user_id_fkey(full_name)')
      .eq('id', employeeId)
      .single(),
    getSupabaseAdminClient().from('company_settings').select('company_name').eq('id', 1).single(),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="My ID badge" subtitle="Keep it on your phone or print it — HR scans it at the entrance." />
      {me ? (
        <BadgePageCard
          employeeCode={me.employee_code}
          fullName={me.user?.full_name ?? ''}
          designation={me.designation?.title}
          department={me.department?.name}
          companyName={settings?.company_name ?? 'HCM Lite'}
        />
      ) : null}
    </div>
  );
}
