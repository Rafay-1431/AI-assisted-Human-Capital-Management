'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { pushToast } from '@/store/slices/uiSlice';
import { badgeScanAction } from '@/actions/attendance-actions';
import { Field, btn } from '@/components/ui/primitives';

/**
 * html5-qrcode scanner modal (M4 extension). On a successful scan the badge
 * payload is parsed, the server action calls the badge_check_in/out SECURITY
 * DEFINER rpc (role rules live server-side), and a toast reports the result.
 * Includes a manual code entry fallback for cameras that are unavailable.
 */

const QR_PAYLOAD_TYPE = 'hcm-lite-badge';

/** Accepts our JSON badge payload, or a bare employee code. */
function parseBadge(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (data?.type === QR_PAYLOAD_TYPE && typeof data.employee_code === 'string') {
      return data.employee_code;
    }
    return null;
  } catch {
    if (/^[A-Za-z0-9._-]{2,32}$/.test(text)) return text;
    return null;
  }
}

export default function ScanBadgeButton({ label = 'Scan Employee Badge', defaultMode = 'in', className }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(defaultMode); // 'in' | 'out'
  const [phase, setPhase] = useState('idle'); // idle | starting | scanning | submitting | done
  const [result, setResult] = useState(null); // { ok, title, description }
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ code: null, at: 0 });

  // Start the camera when the modal opens; stop it on close/unmount.
  useEffect(() => {
    if (!open || phase !== 'scanning' && phase !== 'idle') return undefined;
    let cancelled = false;
    let scanner = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode('qr-reader-region', { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 210, height: 210 } },
          (decodedText) => {
            const code = parseBadge(decodedText);
            if (!code) return; // ignore foreign QR codes silently
            const now = Date.now();
            if (lastScanRef.current.code === code && now - lastScanRef.current.at < 4000) return;
            lastScanRef.current = { code, at: now };
            submit(code);
          },
          () => { /* per-frame decode misses — ignored */ },
        );
        if (!cancelled) setPhase('scanning');
      } catch (err) {
        if (!cancelled) {
          setPhase('scanning');
          setResult({ ok: false, title: 'Camera unavailable', description: 'Use manual entry below.' });
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function submit(code) {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      scannerRef.current = null;
    }
    setPhase('submitting');
    const res = await badgeScanAction({ employeeCode: code, mode });
    if (res?.ok) {
      const verb = mode === 'out' ? 'Checked out' : 'Checked in';
      setResult({ ok: true, title: `${verb}: ${res.employeeName}`, description: `Code ${res.employeeCode} · ${new Date(res.attendance?.check_in_at ?? res.attendance?.check_out_at ?? Date.now()).toLocaleTimeString('en-GB')}` });
      dispatch(pushToast({ variant: 'success', title: `✓ ${verb}`, description: `${res.employeeName} (${res.employeeCode})` }));
      router.refresh();
    } else {
      setResult({ ok: false, title: 'Not marked', description: res?.error?.message ?? 'Scan failed.' });
      dispatch(pushToast({ variant: 'error', title: 'Scan failed', description: res?.error?.message ?? '' }));
    }
    setPhase('done');
  }

  function closeModal() {
    setOpen(false);
    setPhase('idle');
    setResult(null);
    setManualCode('');
  }

  return (
    <>
      <button className={className ?? btn.primary} onClick={() => { setMode(defaultMode); setOpen(true); }}>
        📷 {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <p className="font-semibold text-gray-900">
                {mode === 'in' ? 'Scan badge — check in' : 'Scan badge — check out'}
              </p>
              <button onClick={closeModal} aria-label="Close scanner" className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4 p-4">
              {/* In / Out toggle */}
              <div className="grid grid-cols-2 gap-2">
                {['in', 'out'].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setResult(null); setPhase('idle'); }}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${
                      mode === m ? 'bg-teal-600 text-white ring-teal-600' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {m === 'in' ? 'Check in' : 'Check out'}
                  </button>
                ))}
              </div>

              {/* Camera view */}
              {phase !== 'done' ? (
                <div>
                  <div id="qr-reader-region" className="mx-auto w-full overflow-hidden rounded-xl bg-gray-900 [&_video]:w-full" />
                  <p className="mt-2 text-center text-xs text-gray-400">
                    {phase === 'starting' || phase === 'idle' ? 'Starting camera…' : 'Point the camera at an employee badge QR'}
                  </p>
                </div>
              ) : (
                <div className={`rounded-xl p-4 text-center ${result?.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className={`font-semibold ${result?.ok ? 'text-emerald-800' : 'text-red-700'}`}>{result?.title}</p>
                  {result?.description ? <p className="mt-1 text-xs text-gray-600">{result.description}</p> : null}
                </div>
              )}

              {/* Manual fallback */}
              {phase !== 'done' ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualCode.trim()) submit(manualCode.trim());
                  }}
                >
                  <div className="flex-1">
                    <Field label="Manual entry" id="manual-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="EMP-001" />
                  </div>
                  <button type="submit" className={btn.ghost} disabled={phase === 'submitting' || !manualCode.trim()}>
                    {phase === 'submitting' ? '…' : 'Mark'}
                  </button>
                </form>
              ) : null}

              <div className="flex gap-2">
                {phase === 'done' ? (
                  <button className={btn.primary + ' w-full'} onClick={() => { setResult(null); setPhase('idle'); }}>
                    Scan another badge
                  </button>
                ) : null}
                <button className={btn.ghost + ' w-full'} onClick={closeModal}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
