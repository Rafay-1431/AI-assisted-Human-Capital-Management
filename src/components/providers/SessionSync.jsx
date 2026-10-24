'use client';

import { useEffect } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { profileSynced, sessionCleared } from '@/store/slices/authSlice';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Bridges the server session into Redux — the App Router hydration story:
 *
 * 1. A server component (root or dashboard layout) calls requireUser() /
 *    getSessionAction() and passes the profile down as a PROP. Server HTML is
 *    rendered from props, never from Redux → zero hydration mismatch.
 * 2. On mount this component dispatches the profile into authSlice.
 * 3. It also subscribes to supabase.auth.onAuthStateChange so an expired or
 *    signed-out session clears the client mirror immediately (the server is
 *    still the enforcement layer; this only keeps the UI honest).
 */
export default function SessionSync({ profile }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(profile ? profileSynced(profile) : sessionCleared());
  }, [profile, dispatch]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // On sign-out, clear the mirror. Full redirect is handled by the proxy
        // on the next navigation.
        if (event === 'SIGNED_OUT') dispatch(sessionCleared());
      }
    });
    return () => data.subscription.unsubscribe();
  }, [dispatch]);

  return null;
}
