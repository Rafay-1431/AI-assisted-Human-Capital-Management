import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/services/guard';
import { listAuditLogsAction } from '@/actions/comms-actions';
import { PageHeader, EmptyState, TableWrap, Th, Td, Badge, btn } from '@/components/ui/primitives';

/** Audit log (checklist 25) — Admin only, append-only (no edits exist in the DB). */
export default async function AuditLogPage({ searchParams }) {
  const sp = await searchParams;
  const { profile } = await requireUser();
  if (profile.role !== 'admin') redirect('/dashboard');

  const page = Math.max(1, Number(sp.page) || 1);
  const result = await listAuditLogsAction({ page, pageSize: 20 });
  const rows = result?.ok ? result.rows : [];
  const total = result?.ok ? result.total : 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader title="Audit log" subtitle={`${total} recorded actions — create, update, approve, finalize. Append-only: nobody can edit or delete entries.`} />

      {rows.length === 0 ? (
        <EmptyState title="No audit entries yet" hint="Every important action (creates, approvals, payroll finalize) is recorded here." />
      ) : (
        <>
          <TableWrap>
            <thead><tr><Th>When</Th><Th>Actor</Th><Th>Role</Th><Th>Action</Th><Th>Entity</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-gray-500">{new Date(r.created_at).toLocaleString('en-GB', { hour12: false })}</Td>
                  <Td className="font-medium text-gray-900">{r.actor?.full_name ?? 'system / removed user'}</Td>
                  <Td>{r.actor_role ? <Badge tone={r.actor_role === 'admin' ? 'violet' : r.actor_role === 'hr' ? 'teal' : 'gray'}>{r.actor_role}</Badge> : '—'}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td className="text-gray-500">{r.entity}{r.entity_id ? <span className="ml-1 font-mono text-[10px] text-gray-300">{r.entity_id.slice(0, 8)}</span> : null}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                {page > 1 ? <Link href={`/audit-log?page=${page - 1}`} className={btn.ghost}>Previous</Link> : null}
                {page < pageCount ? <Link href={`/audit-log?page=${page + 1}`} className={btn.ghost}>Next</Link> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
