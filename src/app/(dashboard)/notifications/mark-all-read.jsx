'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markAllNotificationsReadAction } from '@/actions/comms-actions';
import { btn } from '@/components/ui/primitives';

export default function MarkAllRead() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function mark() {
    setPending(true);
    const result = await markAllNotificationsReadAction();
    setPending(false);
    if (result?.ok) router.refresh();
  }

  return (
    <button onClick={mark} disabled={pending} className={btn.ghost}>
      {pending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
