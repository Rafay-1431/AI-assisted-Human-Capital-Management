'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSettingsAction } from '@/actions/org-actions';
import { Field, btn } from '@/components/ui/primitives';

const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export default function SettingsForm({ settings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: settings.company_name ?? '',
    officeStart: (settings.office_start_time ?? '09:00').slice(0, 5),
    graceMinutes: settings.grace_minutes ?? 15,
    halfDayThresholdHours: settings.half_day_threshold_hours ?? 5,
    weekendDays: settings.weekend_days ?? [0, 6],
    timezone: settings.timezone ?? 'Asia/Karachi',
    officeLatitude: settings.office_latitude ?? '',
    officeLongitude: settings.office_longitude ?? '',
    officeRadiusM: settings.office_radius_m ?? 150,
  });
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  function toggleDay(day) {
    setSaved(false);
    setForm((f) => ({
      ...f,
      weekendDays: f.weekendDays.includes(day)
        ? f.weekendDays.filter((d) => d !== day)
        : [...f.weekendDays, day].sort(),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateSettingsAction(form);
    setPending(false);
    if (!result?.ok) {
      setError(result?.error?.message ?? 'Save failed.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p> : null}

      <Field label="Company name" id="companyName" value={form.companyName} onChange={set('companyName')} required />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Office start" id="officeStart" type="time" value={form.officeStart} onChange={set('officeStart')} />
        <Field label="Grace minutes" id="graceMinutes" type="number" min="0" max="120" value={form.graceMinutes} onChange={set('graceMinutes')} />
        <Field label="Half day below (hours)" id="halfDayThresholdHours" type="number" min="1" max="8" step="0.5" value={form.halfDayThresholdHours} onChange={set('halfDayThresholdHours')} />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">Weekend days</p>
        <div className="flex gap-2">
          {DAYS.map((d) => (
            <button
              type="button"
              key={d.value}
              onClick={() => toggleDay(d.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                form.weekendDays.includes(d.value)
                  ? 'bg-teal-600 text-white ring-teal-600'
                  : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Office latitude" id="officeLatitude" type="number" step="any" value={form.officeLatitude} onChange={set('officeLatitude')} placeholder="24.8607" />
        <Field label="Office longitude" id="officeLongitude" type="number" step="any" value={form.officeLongitude} onChange={set('officeLongitude')} placeholder="67.0011" />
        <Field label="Radius (meters)" id="officeRadiusM" type="number" min="10" value={form.officeRadiusM} onChange={set('officeRadiusM')} />
      </div>

      <Field label="Timezone" id="timezone" value={form.timezone} onChange={set('timezone')} />

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
