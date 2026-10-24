'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setupCompanyAction } from '@/actions/auth-actions';

const initialForm = {
  companyName: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  officeStart: '09:00',
  graceMinutes: 15,
};

/** First-run setup (checklist 01): company profile + the Admin account. */
export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await setupCompanyAction({
      ...form,
      graceMinutes: Number(form.graceMinutes) || 15,
    });
    if (!result?.ok) {
      setPending(false);
      setError(result?.error?.message ?? 'Setup failed.');
      return;
    }
    router.replace('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-teal-700">Welcome to HCM Lite</h1>
          <p className="text-sm text-gray-500">
            One-time setup: create your company and the first Admin account.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {[
          ['companyName', 'Company name', 'text', 'Acme Pvt Ltd'],
          ['adminName', 'Admin full name', 'text', 'Ayesha Khan'],
          ['adminEmail', 'Admin email', 'email', 'admin@company.com'],
          ['adminPassword', 'Admin password (min 8 chars)', 'password', '••••••••'],
          ['officeStart', 'Office start time', 'time', '09:00'],
          ['graceMinutes', 'Grace minutes', 'number', '15'],
        ].map(([key, label, type, placeholder]) => (
          <div key={key} className="space-y-1">
            <label htmlFor={key} className="text-sm font-medium text-gray-700">
              {label}
            </label>
            <input
              id={key}
              type={type}
              required={key !== 'officeStart' && key !== 'graceMinutes'}
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? 'Creating company…' : 'Create company & Admin'}
        </button>
      </form>
    </main>
  );
}
