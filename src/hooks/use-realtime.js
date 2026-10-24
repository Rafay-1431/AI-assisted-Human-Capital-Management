'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Subscribes to Postgres changes via Supabase Realtime and turns them into
 * Redux dispatches (the callback receives the payload).
 *
 * Realtime is evaluated under RLS: a user only receives events for rows they
 * can read, so this is safe to wire directly to UI state.
 *
 * Tables enabled in 00004_analytics_views.sql:
 *   notifications, announcements, attendance, attendance_corrections
 *
 * @param {Object} opts
 * @param {string} opts.table
 * @param {string} [opts.filter] e.g. `user_id=eq.<uuid>`
 * @param {(payload: { eventType: string, new: any, old: any }) => void} opts.onEvent
 */
export function useRealtimeChannel({ table, filter, onEvent }) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channelName = `rt:${table}:${filter ?? 'all'}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onEventRef.current?.({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);
}

/**
 * Ready-made wiring for the top bar: keeps unread notification count fresh
 * and raises a toast whenever something new arrives for this user.
 *
 * @param {{ userId: string }} opts
 */
export function useNotificationSync({ userId, onIncoming }) {
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  const handle = useCallback(
    (payload) => {
      if (payload.eventType === 'INSERT') {
        onIncomingRef.current?.(payload.new);
      }
    },
    [],
  );

  useRealtimeChannel({
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    onEvent: handle,
  });
}
