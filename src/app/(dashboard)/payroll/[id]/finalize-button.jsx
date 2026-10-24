'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { finalizeRun } from '@/store/slices/payrollSlice';
import { useAppDispatch } from '@/store/hooks';
import { btn } from '@/components/ui/primitives';

/** Admin-only. The RPC re-verifies the role; the trigger then locks the month forever. */
export default function FinalizeButton({ runId }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function finalize() {
    if (!window.confirm('Finalize this payroll run? The month becomes permanently locked for everyone — including you.')) return;
    setPending(true);
    const result = await dispatch(finalizeRun(runId));
    setPending(false);
    if (result?.error) {
      window.alert(result.error?.message ?? 'Finalize failed.');
      return;
    }
    router.refresh();
  }

  return (
    <button className={btn.primary} disabled={pending} onClick={finalize}>
      {pending ? 'Finalizing…' : 'Finalize (lock month)'}
    </button>
  );
}
