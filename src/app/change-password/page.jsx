'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePasswordAction } from '@/actions/auth-actions';

/** Temp-password flow (M1): users created by Admin must change on first sign-in. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    setError(null);

    const result = await changePasswordAction({ newPassword });
    if (!result?.ok) {
      setPending(false);
      setError(result?.error?.message ?? 'Password change failed.');
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-teal-700">Set a new password</h1>
          <p className="text-sm text-gray-500">
            Your account uses a temporary password. Choose a new one to continue.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </main>
  );
}
