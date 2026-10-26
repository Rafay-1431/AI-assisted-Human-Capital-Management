'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismissToast } from '@/store/slices/uiSlice';

/**
 * Global toast stack (uiSlice.toasts) — used by the badge scanner and any
 * client flow that needs a success/error notification. Auto-dismisses.
 */

function ToastItem({ toast }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const timer = setTimeout(() => dispatch(dismissToast(toast.id)), 4500);
    return () => clearTimeout(timer);
  }, [toast.id, dispatch]);

  const tones = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-900 text-white',
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 shadow-lg ${tones[toast.variant] ?? tones.info}`}
    >
      <div className="min-w-0">
        {toast.title ? <p className="text-sm font-semibold">{toast.title}</p> : null}
        {toast.description ? <p className="text-xs opacity-90">{toast.description}</p> : null}
      </div>
      <button
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Dismiss notification"
        className="ml-2 text-white/70 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}

export default function ToastHost() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
