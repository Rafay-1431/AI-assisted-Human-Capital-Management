'use client';

'use client';

import QRCode from 'react-qr-code';
import { Card, btn } from '@/components/ui/primitives';

/**
 * Digital employee ID badge (M4 extension). The QR encodes a typed JSON
 * payload — the scanner validates `type` so random QR codes are rejected:
 *   {"type":"hcm-lite-badge","employee_code":"EMP-001"}
 */

export function badgePayload(employeeCode) {
  return JSON.stringify({ type: 'hcm-lite-badge', employee_code: employeeCode });
}

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '—';

/**
 * @param {{ employeeCode: string, fullName: string, designation?: string,
 *           department?: string, companyName?: string, compact?: boolean }} props
 */
export default function IdBadge({ employeeCode, fullName, designation, department, companyName = 'HCM Lite', compact = false }) {
  return (
    <div className={`mx-auto w-full ${compact ? 'max-w-xs' : 'max-w-sm'} overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-gray-200`}>
      <div className="bg-gradient-to-br from-teal-600 to-teal-700 px-5 py-4 text-white">
        <p className="text-lg font-bold">{companyName}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-100">
          Employee ID · {compact ? 'badge' : 'scan at the entrance'}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 px-5 py-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-700 ring-1 ring-teal-200">
          {initials(fullName)}
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">{fullName}</p>
          <p className="text-xs text-gray-500">
            {designation ?? '—'} {department ? `· ${department}` : ''}
          </p>
          <p className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
            {employeeCode}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <QRCode value={badgePayload(employeeCode)} size={compact ? 132 : 168} bgColor="#ffffff" fgColor="#0f172a" level="M" />
        </div>

        <p className="text-center text-[11px] text-gray-400">
          Present this code to an HR scanner — the server stamps your time.
        </p>
      </div>
    </div>
  );
}

/** Full-page wrapper for /attendance/badge with print support. */
export function BadgePageCard(props) {
  return (
    <Card className="border-none p-0 shadow-none ring-0">
      <IdBadge {...props} />
      <div className="mt-5 flex justify-center no-print">
        <button className={btn.ghost} onClick={() => window.print()}>Print badge</button>
      </div>
    </Card>
  );
}
