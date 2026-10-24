'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitCorrectionAction } from '@/actions/attendance-actions';
import { Card, Field, TextAreaField, btn } from '@/components/ui/primitives';

export default function CorrectionForm() {
  const router = useRouter();
  const [form, setForm] = useState({ workDate: '', checkIn: '', checkOut: '', reason: '' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key) => (e) => { setOk(false); setForm((f) => ({ ...f, [key]: e.target.value })); };

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const result = await submitCorrectionAction({
      workDate: form.workDate,
      checkIn: form.checkIn ? new Date(`${form.workDate}T${form.checkIn}:00`).toISOString() : null,
      checkOut: form.checkOut ? new Date(`${form.workDate}T${form.checkOut}:00`).toISOString() : null,
      reason: form.reason,
    });
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Submission failed.');
    setOk(true);
    setForm({ workDate: '', checkIn: '', checkOut: '', reason: '' });
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        {ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Request submitted — HR will review it.</p> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Date" id="c-date" type="date" value={form.workDate} onChange={set('workDate')} required />
          <Field label="Correct check-in" id="c-in" type="time" value={form.checkIn} onChange={set('checkIn')} />
          <Field label="Correct check-out" id="c-out" type="time" value={form.checkOut} onChange={set('checkOut')} />
        </div>
        <TextAreaField label="Reason" id="c-reason" value={form.reason} onChange={set('reason')} required placeholder="e.g. Checked in from the wrong device — actual time was 08:55." />
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Submitting…' : 'Submit request'}</button>
        </div>
      </form>
    </Card>
  );
}
