'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerEmployeeAction } from '@/actions/employee-actions';
import { Field, SelectField, btn } from '@/components/ui/primitives';

export default function EmployeeForm({ departments, designations }) {
  const [form, setForm] = useState({
    fullName: '', email: '', employeeCode: '', departmentId: '', designationId: '',
    joinDate: '', basicSalary: '', gender: '', dateOfBirth: '', phone: '', address: '',
    employmentStatus: 'probation',
  });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await registerEmployeeAction(form);
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Registration failed.');
    setCreated({ id: result.employeeId, tempPassword: result.tempPassword, email: form.email });
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="font-semibold text-emerald-800">Employee registered ✓</p>
          <p className="mt-2 text-sm text-emerald-800">
            Login <span className="font-mono">{created.email}</span> was created with temporary password
            (shown once, they must change it on first sign-in):
          </p>
          <p className="mt-1 select-all font-mono text-lg font-bold text-emerald-900">{created.tempPassword}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/employees/${created.id}`} className={btn.primary}>Open 360 profile</Link>
          <button className={btn.ghost} onClick={() => { setCreated(null); }}>Register another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" id="f-name" value={form.fullName} onChange={set('fullName')} required />
        <Field label="Email (becomes the login)" id="f-email" type="email" value={form.email} onChange={set('email')} required />
        <Field label="Employee code" id="f-code" value={form.employeeCode} onChange={set('employeeCode')} required placeholder="EMP-001" />
        <Field label="Join date" id="f-join" type="date" value={form.joinDate} onChange={set('joinDate')} required />
        <SelectField label="Department" id="f-dept" value={form.departmentId} onChange={set('departmentId')} options={[{ value: '', label: '— none —' }, ...departments]} />
        <SelectField label="Designation" id="f-desig" value={form.designationId} onChange={set('designationId')} options={[{ value: '', label: '— none —' }, ...designations]} />
        <Field label="Basic salary (monthly)" id="f-salary" type="number" min="1" step="0.01" value={form.basicSalary} onChange={set('basicSalary')} required />
        <SelectField label="Status" id="f-status" value={form.employmentStatus} onChange={set('employmentStatus')} options={[{ value: 'probation', label: 'Probation' }, { value: 'active', label: 'Active' }]} />
        <SelectField label="Gender" id="f-gender" value={form.gender} onChange={set('gender')} options={[{ value: '', label: '—' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
        <Field label="Date of birth" id="f-dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
        <Field label="Phone" id="f-phone" value={form.phone} onChange={set('phone')} />
        <Field label="Address" id="f-address" value={form.address} onChange={set('address')} />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? 'Registering…' : 'Register employee & create login'}
        </button>
      </div>
    </form>
  );
}
