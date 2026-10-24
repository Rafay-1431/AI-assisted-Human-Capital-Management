/**
 * Minimal shared UI primitives — plain presentational components usable from
 * both server and client components (no hooks, no client-only APIs).
 * BambooHR tone: white cards, teal primary, gray-50 canvas, generous spacing.
 */

export const btn = {
  primary:
    'rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50',
  ghost:
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50',
  danger:
    'rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50',
  small:
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50',
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-10 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, id, ...props }) {
  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}
      <input id={id} className={inputClass} {...props} />
    </div>
  );
}

export function TextAreaField({ label, id, rows = 3, ...props }) {
  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}
      <textarea id={id} rows={rows} className={inputClass} {...props} />
    </div>
  );
}

export function SelectField({ label, id, options = [], ...props }) {
  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}
      <select id={id} className={inputClass} {...props}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const TONES = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  teal: 'bg-teal-50 text-teal-700',
  violet: 'bg-violet-50 text-violet-700',
};

export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.gray}`}>
      {children}
    </span>
  );
}

export function TableWrap({ children }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th className={`border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`border-b border-gray-100 px-4 py-3 align-middle ${className}`}>{children}</td>;
}

const STATUS_TONES = {
  active: 'green',
  probation: 'amber',
  exited: 'red',
  present: 'green',
  late: 'amber',
  half_day: 'amber',
  missing_checkout: 'red',
  absent: 'red',
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  draft: 'amber',
  finalized: 'green',
};

export function StatusBadge({ value }) {
  return <Badge tone={STATUS_TONES[value] ?? 'gray'}>{String(value ?? '—').replace('_', ' ')}</Badge>;
}
