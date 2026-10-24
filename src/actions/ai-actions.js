'use server';

/**
 * ai-actions — server action wrappers for M8 features used outside the chat
 * panel (e.g. the "Summarize" button on Admin/HR dashboards).
 */

import { assertStaff, withAction } from '@/services/guard';
import { summarizeDashboard } from '@/lib/ai/ai-service';

/**
 * @param {{ kpis: object, filters: object }} payload — KPI JSON already computed
 * server-side for the CURRENT dashboard filters (no client-provided numbers).
 */
export async function summarizeDashboardAction(payload) {
  return withAction(async () => {
    const session = await assertStaff();
    const { bullets } = await summarizeDashboard({
      profile: session.profile,
      kpis: payload.kpis,
      filters: payload.filters,
    });
    return { bullets }; // null → UI falls back to the normal dashboard
  });
}
