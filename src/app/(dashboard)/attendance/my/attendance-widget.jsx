'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchToday, checkIn, checkOut, clearAttendanceError } from '@/store/slices/attendanceSlice';
import { selectIsCheckedIn, selectIsCheckedOut } from '@/store/slices/attendanceSlice';
import { Badge, btn } from '@/components/ui/primitives';

/**
 * Daily check-in/out widget (M4). Time stamping, the one-per-day 409 and the
 * status rules live in the SECURITY DEFINER rpcs — the client only sends the
 * claim. State flows through Redux (attendanceSlice thunks → server actions).
 */
export default function AttendanceWidget() {
  const dispatch = useAppDispatch();
  const { today, todayStatus, checkInPending, checkOutPending, error } = useAppSelector((s) => s.attendance);
  const isCheckedIn = useAppSelector(selectIsCheckedIn);
  const isCheckedOut = useAppSelector(selectIsCheckedOut);

  useEffect(() => {
    dispatch(fetchToday());
    return () => dispatch(clearAttendanceError());
  }, [dispatch]);

  const time = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">Today</p>
          {todayStatus === 'loading' ? (
            <p className="mt-1 text-lg text-gray-400">Loading…</p>
          ) : isCheckedOut ? (
            <p className="mt-1 text-lg font-semibold text-gray-900">
              Checked out · {time(today.checkInAt)} → {time(today.checkOutAt)}
            </p>
          ) : isCheckedIn ? (
            <p className="mt-1 text-lg font-semibold text-gray-900">Checked in at {time(today.checkInAt)}</p>
          ) : (
            <p className="mt-1 text-lg font-semibold text-gray-900">Not checked in yet</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {today?.status ? <Badge tone={today.status === 'late' ? 'amber' : 'green'}>{String(today.status).replace('_', ' ')}</Badge> : null}
          {!isCheckedIn && !isCheckedOut ? (
            <button className={btn.primary} disabled={checkInPending} onClick={() => dispatch(checkIn({ source: 'web' }))}>
              {checkInPending ? 'Checking in…' : 'Check in'}
            </button>
          ) : null}
          {isCheckedIn ? (
            <button className={btn.primary} disabled={checkOutPending} onClick={() => dispatch(checkOut({ source: 'web' }))}>
              {checkOutPending ? 'Checking out…' : 'Check out'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
