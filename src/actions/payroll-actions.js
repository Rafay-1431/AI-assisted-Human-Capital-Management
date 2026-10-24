'use server';

/**
 * payroll-actions — M6. The client only ever sends { year, month } or a run id;
 * every number is recomputed server-side in services/payroll-service.js.
 */

import { revalidatePath } from 'next/cache';
import { withAction } from '@/services/guard';
import {
  previewPayrollRun,
  createPayrollRun,
  finalizePayrollRun,
} from '@/services/payroll-service';

export async function previewPayrollRunAction({ year, month }) {
  return withAction(async () => {
    const preview = await previewPayrollRun({ year, month });
    return { preview };
  });
}

export async function createPayrollRunAction({ year, month }) {
  return withAction(async () => {
    const { runId } = await createPayrollRun({ year, month });
    revalidatePath('/payroll');
    revalidatePath('/payslips');
    return { runId };
  });
}

export async function finalizePayrollRunAction(runId) {
  return withAction(async () => {
    const { runId: finalizedId } = await finalizePayrollRun(runId);
    revalidatePath('/payroll');
    revalidatePath('/payslips');
    return { runId: finalizedId };
  });
}
