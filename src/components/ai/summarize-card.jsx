'use client';

import { useState } from 'react';
import { summarizeDashboardAction } from '@/actions/ai-actions';

/**
 * "Summarize" (checklist 20, Admin/HR): sends the KPI JSON for the CURRENT
 * dashboard to the AI, renders 3–5 insight bullets. Falls back to a quiet
 * message if the provider is unavailable (brief guardrail: graceful failure).
 */
export default function SummarizeCard({ kpis, filters }) {
  const [bullets, setBullets] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | error

  async function summarize() {
    setState('loading');
    const result = await summarizeDashboardAction({ kpis, filters });
    if (result?.ok && result.bullets?.length) {
      setBullets(result.bullets);
      setState('idle');
    } else {
      setState('error');
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 p-5 text-white shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">✨ AI insights</p>
          <p className="text-xs text-teal-100">3–5 bullets from exactly the KPIs on this dashboard.</p>
        </div>
        <button
          onClick={summarize}
          disabled={state === 'loading'}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
        >
          {state === 'loading' ? 'Thinking…' : 'Summarize'}
        </button>
      </div>

      {bullets ? (
        <ul className="mt-4 space-y-2 text-sm text-teal-50">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-teal-200">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {state === 'error' ? (
        <p className="mt-3 text-xs text-teal-100/90">
          AI summary unavailable right now — the dashboard below has all the numbers.
        </p>
      ) : null}
      {bullets ? (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-teal-200">AI-generated</p>
      ) : null}
    </div>
  );
}
