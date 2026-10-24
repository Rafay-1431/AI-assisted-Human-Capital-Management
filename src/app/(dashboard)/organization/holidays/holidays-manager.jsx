'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addHolidayAction, deleteHolidayAction } from '@/actions/org-actions';
import { Field, TableWrap, Th, Td, btn } from '@/components/ui/primitives';

export default function HolidaysManager({ holidays, canManage = true }) {
  const router = useRouter();
  const [holidayDate, setHolidayDate] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function add(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addHolidayAction({ holidayDate, title });
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Failed.');
    setHolidayDate('');
    setTitle('');
    router.refresh();
  }

  async function remove(id) {
    if (!window.confirm('Remove this holiday?')) return;
    const result = await deleteHolidayAction(id);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Delete failed.');
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      {canManage ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div><Field label="Date" id="holiday-date" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required /></div>
          <div className="min-w-48 flex-1"><Field label="Title" id="holiday-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Independence Day" /></div>
          <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Adding…' : 'Add holiday'}</button>
        </form>
      ) : null}

      {holidays.length > 0 ? (
        <TableWrap>
          <thead><tr><Th>Date</Th><Th>Title</Th>{canManage ? <Th /> : null}</tr></thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id}>
                <Td className="font-medium text-gray-900">{h.holiday_date}</Td>
                <Td className="text-gray-500">{h.title}</Td>
                {canManage ? <Td className="text-right"><button className={btn.danger} onClick={() => remove(h.id)}>Delete</button></Td> : null}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}
    </div>
  );
}
