'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { signOut } from '@/store/slices/authSlice';
import { btn } from '@/components/ui/primitives';

/**
 * Ends the session: the server action clears the Supabase auth cookies,
 * the authSlice thunk clears the client mirror (SessionSync also listens to
 * onAuthStateChange), then we bounce to /login.
 */
export default function LogoutButton() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await dispatch(signOut());
    router.replace('/login');
    router.refresh();
  }

  return (
    <button onClick={handleLogout} disabled={pending} className={btn.ghost}>
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
