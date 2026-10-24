'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDepartmentAction, deleteDepartmentAction } from '@/actions/org-actions';
import { Field, TableWrap, Th, Td, btn } from '@/components/ui/primitives';

export default function DepartmentsManager({ departments, canManage = true }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function addDepartment(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveDepartmentAction({ name, description });
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Failed.');
    setName('');
    setDescription('');
    router.refresh();
  }

  async function remove(id) {
    if (!window.confirm('Delete this department? Employees keep their records but lose the assignment.')) return;
    const result = await deleteDepartmentAction(id);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Delete failed.');
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      {canManage ? (
        <form onSubmit={addDepartment} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Field label="Name" id="dept-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Engineering" /></div>
          <div className="min-w-48 flex-1"><Field label="Description" id="dept-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
          <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Adding…' : 'Add department'}</button>
        </form>
      ) : null}

      {departments.length > 0 ? (
        <TableWrap>
          <thead>
            <tr><Th>Name</Th><Th>Description</Th><Th>Employees</Th>{canManage ? <Th /> : null}</tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <Td className="font-medium text-gray-900">{d.name}</Td>
                <Td className="text-gray-500">{d.description ?? '—'}</Td>
                <Td>{d.employeeCount}</Td>
                {canManage ? (
                  <Td className="text-right"><button className={btn.danger} onClick={() => remove(d.id)}>Delete</button></Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}
    </div>
  );
}
