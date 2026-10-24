import { requireStaff } from '@/services/guard';
import { PageHeader } from '@/components/ui/primitives';
import RunWizard from './run-wizard';

export default async function NewPayrollPage() {
  await requireStaff();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New monthly payroll run" subtitle="Preview computes everything from real attendance — nothing is saved until you create the draft." />
      <RunWizard />
    </div>
  );
}
