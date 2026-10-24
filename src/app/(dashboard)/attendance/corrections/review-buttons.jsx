'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewCorrectionAction } from '@/actions/attendance-actions';
import { btn } from '@/components/ui/primitives';

export default function ReviewButtons({ correctionId }) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);

  async function review(approve) {
    setPending(true);
    const result = await reviewCorrectionAction({ correctionId, approve, comment });
    setPending(false);
    if (!result?.ok) {
      window.alert(result?.error?.message ?? 'Review failed.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="comment (optional)"
        className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <button className={btn.small} disabled={pending} onClick={() => review(true)}>Approve</button>
      <button className={btn.danger} disabled={pending} onClick={() => review(false)}>Reject</button>
    </div>
  );
}
