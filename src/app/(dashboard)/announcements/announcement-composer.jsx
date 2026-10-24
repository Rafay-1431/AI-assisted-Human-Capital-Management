'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postAnnouncementAction } from '@/actions/comms-actions';
import { Field, TextAreaField, SelectField, btn } from '@/components/ui/primitives';

export default function AnnouncementComposer() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', body: '', audience: 'all' });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await postAnnouncementAction(form);
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Post failed.');
    setForm({ title: '', body: '', audience: 'all' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Title" id="a-title" value={form.title} onChange={set('title')} required placeholder="Office closed on Friday" />
        <SelectField label="Audience" id="a-audience" value={form.audience} onChange={set('audience')} options={[{ value: 'all', label: 'Everyone' }, { value: 'employees', label: 'Employees' }, { value: 'hr', label: 'HR team' }]} />
      </div>
      <TextAreaField label="Message" id="a-body" rows={3} value={form.body} onChange={set('body')} required />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Posting…' : 'Post announcement'}</button>
      </div>
    </form>
  );
}
