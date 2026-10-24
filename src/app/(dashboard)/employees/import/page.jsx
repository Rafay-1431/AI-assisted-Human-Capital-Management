import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { PageHeader, Card } from '@/components/ui/primitives';
import CsvWizard from './csv-wizard';

/** Checklist 08 — CSV import is HR-only (enforced by proxy + here). */
export default async function ImportPage() {
  const { profile } = await requireUser();
  if (profile.role !== 'hr') redirect('/employees');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="CSV import"
        subtitle="Dry run first: you get a row-by-row error report. Only valid rows are imported when you confirm."
      />
      <Card>
        <CsvWizard />
      </Card>
    </div>
  );
}
