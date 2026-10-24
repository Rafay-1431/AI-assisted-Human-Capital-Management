'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDesignationAction, deleteDesignationAction } from '@/actions/org-actions';
import { Field, TableWrap, Th, Td, btn } from '@/components/ui/primitives';

export default function DesignationsManager({ designations, canManage = true }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function add(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveDesignationAction({ title });
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Failed.');
    setTitle('');
    router.refresh();
  }

  async function remove(id) {
    if (!window.confirm('Delete this designation?')) return;
    const result = await deleteDesignationAction(id);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Delete failed.');
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      {canManage ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Field label="Title" id="desig-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Software Engineer" /></div>
          <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Adding…' : 'Add designation'}</button>
        </form>
      ) : null}

      {designations.length > 0 ? (
        <TableWrap>
          <thead><tr><Th>Title</Th>{canManage ? <Th /> : null}</tr></thead>
          <tbody>
            {designations.map((d) => (
              <tr key={d.id}>
                <Td className="font-medium text-gray-900">{d.title}</Td>
                {canManage ? <Td className="text-right"><button className={btn.danger} onClick={() => remove(d.id)}>Delete</button></Td> : null}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}
    </div>
  );
}
