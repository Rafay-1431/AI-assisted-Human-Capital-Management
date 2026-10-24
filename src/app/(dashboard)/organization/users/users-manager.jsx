'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserLoginAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from '@/actions/auth-actions';
import { Field, SelectField, TableWrap, Th, Td, Badge, btn } from '@/components/ui/primitives';

export default function UsersManager({ profiles, currentUserId }) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('hr');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState(null); // shown ONCE

  async function createLogin(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createUserLoginAction({ email, fullName, role });
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Create failed.');
    setFullName('');
    setEmail('');
    setIssuedPassword({ email, tempPassword: result.tempPassword });
    router.refresh();
  }

  async function resetPassword(userId) {
    if (!window.confirm('Reset this login to a new temporary password?')) return;
    const result = await resetUserPasswordAction(userId);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Reset failed.');
    else setIssuedPassword({ email: profiles.find((p) => p.id === userId)?.email, tempPassword: result.tempPassword });
  }

  async function toggleActive(userId, isActive) {
    const result = await setUserActiveAction(userId, !isActive);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Update failed.');
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      {issuedPassword ? (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Temporary password for {issuedPassword.email} — shown only once:
          </p>
          <p className="mt-1 select-all font-mono text-lg font-bold text-amber-900">{issuedPassword.tempPassword}</p>
          <p className="mt-1 text-xs text-amber-700">The user must change it at first sign-in.</p>
        </div>
      ) : null}

      <form onSubmit={createLogin} className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1"><Field label="Full name" id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
        <div className="min-w-48 flex-1"><Field label="Email" id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="w-40"><SelectField label="Role" id="u-role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: 'hr', label: 'HR' }, { value: 'employee', label: 'Employee (login only)' }]} /></div>
        <button type="submit" disabled={pending} className={btn.primary}>{pending ? 'Creating…' : 'Create login'}</button>
      </form>

      <TableWrap>
        <thead>
          <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th /></tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-gray-900">{p.full_name}{p.id === currentUserId ? <span className="ml-2 text-xs text-gray-400">(you)</span> : null}</Td>
              <Td className="text-gray-500">{p.email}</Td>
              <Td><Badge tone={p.role === 'admin' ? 'violet' : p.role === 'hr' ? 'teal' : 'gray'}>{p.role}</Badge></Td>
              <Td>{p.is_active ? <Badge tone="green">active</Badge> : <Badge tone="red">deactivated</Badge>}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button className={btn.small} onClick={() => resetPassword(p.id)}>Reset password</button>
                  {p.id !== currentUserId ? (
                    <button className={p.is_active ? btn.danger : btn.small} onClick={() => toggleActive(p.id, p.is_active)}>
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
