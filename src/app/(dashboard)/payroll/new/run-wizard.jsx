'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { previewRun, createRun, setWizardPeriod, resetWizard, clearPayrollError } from '@/store/slices/payrollSlice';
import { SelectField, TableWrap, Th, Td, StatusBadge, btn } from '@/components/ui/primitives';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2026, i).toLocaleString('en', { month: 'long' }) }));
const YEARS = [0, -1, 1].map((d) => new Date().getFullYear() + d);

/**
 * Run wizard (M6) driven by payrollSlice: pick month → server PREVIEW →
 * review the computed draft → create. The client only ever sends { year,
 * month } — every number is recomputed server-side.
 */
export default function RunWizard() {
  const dispatch = useAppDispatch();
  const { wizard, preview, previewStatus, createStatus, error } = useAppSelector((s) => s.payroll);

  const ready = previewStatus === 'ready' && preview;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error.message}</p>
      ) : null}

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48"><SelectField label="Year" id="w-year" value={wizard.year ?? YEARS[0]} onChange={(e) => dispatch(setWizardPeriod({ year: Number(e.target.value), month: wizard.month ?? 1 }))} options={YEARS.map((y) => ({ value: y, label: y }))} /></div>
          <div className="w-48"><SelectField label="Month" id="w-month" value={wizard.month ?? 1} onChange={(e) => dispatch(setWizardPeriod({ year: wizard.year ?? YEARS[0], month: Number(e.target.value) }))} options={MONTHS} /></div>
          <button className={btn.primary} disabled={previewStatus === 'loading'} onClick={() => dispatch(previewRun({ year: wizard.year ?? YEARS[0], month: wizard.month ?? 1 }))}>
            {previewStatus === 'loading' ? 'Computing…' : 'Preview run'}
          </button>
          <button className={btn.ghost} onClick={() => dispatch(resetWizard())}>Reset</button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Working days skip weekends and holidays; joiners/leavers are prorated; deductions = absent days + 0.5 × half days; tax uses the annual slabs ÷ 12.
        </p>
      </div>

      {ready ? (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 font-medium">{preview.period.month}/{preview.period.year}</span>
            <span className="rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-700">Working days: {preview.working_days}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1">Employees: {preview.totals.employee_count}</span>
          </div>

          {preview.payslips.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
              No employees fall in this period (check registrations and join dates).
            </div>
          ) : (
            <TableWrap>
              <thead>
                <tr><Th>Employee</Th><Th>Days</Th><Th>Present</Th><Th>Late</Th><Th>Half</Th><Th>Absent</Th><Th>Gross</Th><Th>Deductions</Th><Th>Tax</Th><Th>Net</Th></tr>
              </thead>
              <tbody>
                {preview.payslips.map((p) => (
                  <tr key={p.employee_id}>
                    <Td className="font-medium text-gray-900">{p.full_name} <span className="font-mono text-xs text-gray-400">{p.employee_code}</span></Td>
                    <Td>{p.working_days}</Td>
                    <Td>{p.present_days}</Td>
                    <Td>{p.late_count}</Td>
                    <Td>{p.half_day_count}</Td>
                    <Td>{p.absent_days}</Td>
                    <Td>{p.gross_salary.toLocaleString()}</Td>
                    <Td className="text-red-600">{(p.absent_deduction + p.half_day_deduction).toLocaleString()}</Td>
                    <Td className="text-red-600">{p.tax_amount.toLocaleString()}</Td>
                    <Td className="font-semibold">{p.net_pay.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Gross <b className="ml-1">{preview.totals.gross.toLocaleString()}</b></span>
              <span>Deductions <b className="ml-1 text-red-600">{preview.totals.deductions.toLocaleString()}</b></span>
              <span>Tax <b className="ml-1 text-red-600">{preview.totals.tax.toLocaleString()}</b></span>
              <span>Net <b className="ml-1 text-teal-700">{preview.totals.net.toLocaleString()}</b></span>
            </div>
            <button className={btn.primary} disabled={createStatus === 'loading' || preview.payslips.length === 0} onClick={() => dispatch(createRun({ year: preview.period.year, month: preview.period.month }))}>
              {createStatus === 'loading' ? 'Creating…' : 'Create draft run'}
            </button>
          </div>

          {createStatus === 'success' ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
              Draft created ✓ <Link href="/payroll" className="font-semibold underline">Open payroll runs</Link> to review and finalize.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
