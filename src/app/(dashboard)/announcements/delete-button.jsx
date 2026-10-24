'use client';

import { useRouter } from 'next/navigation';
import { deleteAnnouncementAction } from '@/actions/comms-actions';

export default function DeleteButton({ id }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm('Delete this announcement?')) return;
    const result = await deleteAnnouncementAction(id);
    if (!result?.ok) window.alert(result?.error?.message ?? 'Delete failed.');
    else router.refresh();
  }

  return (
    <button onClick={remove} className="text-xs font-medium text-red-500 hover:text-red-700">
      Delete
    </button>
  );
}
