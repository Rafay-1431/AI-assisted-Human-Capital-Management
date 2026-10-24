'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importPreviewAction, importCommitAction } from '@/actions/employee-actions';
import { TableWrap, Th, Td, Badge, btn } from '@/components/ui/primitives';

const SAMPLE = 'employee_code,full_name,email,department,join_date,basic_salary,gender,phone\nEMP-101,Ali Raza,ali@company.com,Engineering,2026-01-15,85000,male,03001234567';

export default function CsvWizard() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [csvText, setCsvText] = useState('');
  const [step, setStep] = useState('input'); // input | report | done
  const [report, setReport] = useState(null);
  const [commit, setCommit] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCsvText(String(reader.result ?? '')); setStep('input'); };
    reader.readAsText(file);
  }

  async function runDry() {
    setPending(true);
    setError(null);
    const result = await importPreviewAction(csvText);
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Dry run failed.');
    setReport(result);
    setStep('report');
  }

  async function doCommit() {
    setPending(true);
    setError(null);
    const result = await importCommitAction(csvText);
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Import failed.');
    setCommit(result);
    setStep('done');
    router.refresh();
  }

  function reset() {
    setCsvText('');
    setReport(null);
    setCommit(null);
    setStep('input');
    if (fileRef.current) fileRef.current.value = '';
  }

  if (step === 'done' && commit) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="font-semibold text-emerald-800">
            Imported {commit.createdCount} employee{commit.createdCount === 1 ? '' : 's'}
            {commit.failed.length > 0 ? `, ${commit.failed.length} failed` : ''}
            {commit.skippedCount > 0 ? `, ${commit.skippedCount} skipped (dry-run errors)` : ''}.
          </p>
        </div>

        {commit.credentials.length > 0 ? (
          <TableWrap>
            <thead><tr><Th>Email</Th><Th>Code</Th><Th>Temporary password (once)</Th></tr></thead>
            <tbody>
              {commit.credentials.map((c) => (
                <tr key={c.email}>
                  <Td>{c.email}</Td><Td className="font-mono text-xs">{c.code}</Td>
                  <Td className="select-all font-mono">{c.tempPassword}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : null}

        {commit.failed.length > 0 ? (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
            {commit.failed.map((f, i) => <p key={i}><b>{f.row}</b>: {f.reason}</p>)}
          </div>
        ) : null}

        <button className={btn.ghost} onClick={reset}>Import another file</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      {step === 'input' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
            <span>or paste CSV below</span>
            <button type="button" className={btn.small} onClick={() => setCsvText(SAMPLE)}>Load sample header</button>
          </div>
          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={SAMPLE}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-gray-400">
            Required columns: employee_code, full_name, email, department, join_date, basic_salary. Optional: designation, gender, date_of_birth, phone, address.
          </p>
          <button className={btn.primary} disabled={pending || !csvText.trim()} onClick={runDry}>
            {pending ? 'Validating…' : 'Run dry-run validation'}
          </button>
        </>
      ) : null}

      {step === 'report' && report ? (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge tone="gray">{report.totalRows} rows in file</Badge>
            <Badge tone="green">{report.validCount} valid</Badge>
            <Badge tone={report.errorCount > 0 ? 'red' : 'gray'}>{report.errorCount} errors</Badge>
          </div>

          {report.errors.length > 0 ? (
            <TableWrap>
              <thead><tr><Th>Row</Th><Th>Field</Th><Th>Problem</Th></tr></thead>
              <tbody>
                {report.errors.slice(0, 50).map((e, i) => (
                  <tr key={i}><Td>{e.row}</Td><Td className="font-mono text-xs">{e.field}</Td><Td className="text-red-600">{e.reason}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
          ) : null}

          <div className="flex gap-2">
            <button className={btn.primary} disabled={report.validCount === 0 || pending} onClick={doCommit}>
              {pending ? 'Importing…' : `Import ${report.validCount} valid row${report.validCount === 1 ? '' : 's'}`}
            </button>
            <button className={btn.ghost} onClick={reset}>Back</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
