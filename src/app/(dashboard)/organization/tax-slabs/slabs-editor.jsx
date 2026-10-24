'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveTaxSlabsAction } from '@/actions/org-actions';
import { TableWrap, Th, Td, btn } from '@/components/ui/primitives';

const blank = { min_amount: '', max_amount: '', rate_pct: '', flat_amount: '' };

export default function SlabsEditor({ initialSlabs }) {
  const router = useRouter();
  const [slabs, setSlabs] = useState(
    (initialSlabs.length > 0 ? initialSlabs : []).map((s) => ({
      min_amount: String(s.min_amount),
      max_amount: s.max_amount == null ? '' : String(s.max_amount),
      rate_pct: String(s.rate_pct),
      flat_amount: String(s.flat_amount),
    })),
  );
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const update = (i, key) => (e) => {
    setSaved(false);
    setSlabs((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)));
  };

  async function save(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveTaxSlabsAction(slabs);
    setPending(false);
    if (!result?.ok) return setError(result?.error?.message ?? 'Save failed.');
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Slabs saved.</p> : null}

      <TableWrap>
        <thead>
          <tr><Th>Min (annual)</Th><Th>Max (annual, blank = ∞)</Th><Th>Rate %</Th><Th>Flat at min</Th><Th /></tr>
        </thead>
        <tbody>
          {slabs.map((s, i) => (
            <tr key={i}>
              <Td><input type="number" required min="0" value={s.min_amount} onChange={update(i, 'min_amount')} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" /></Td>
              <Td><input type="number" min="0" value={s.max_amount} onChange={update(i, 'max_amount')} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" /></Td>
              <Td><input type="number" required min="0" max="100" step="0.01" value={s.rate_pct} onChange={update(i, 'rate_pct')} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" /></Td>
              <Td><input type="number" min="0" value={s.flat_amount} onChange={update(i, 'flat_amount')} className="w-28 rounded border border-gray-300 px-2 py-1 text-sm" /></Td>
              <Td className="text-right">
                <button type="button" className={btn.small} onClick={() => setSlabs((rows) => rows.filter((_, idx) => idx !== i))}>Remove</button>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="flex items-center justify-between">
        <button type="button" className={btn.ghost} onClick={() => setSlabs((rows) => [...rows, { ...blank }])}>
          + Add slab
        </button>
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? 'Saving…' : 'Save slabs'}
        </button>
      </div>
    </form>
  );
}
