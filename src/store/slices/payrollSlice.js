import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  previewPayrollRunAction,
  createPayrollRunAction,
  finalizePayrollRunAction,
} from '@/actions/payroll-actions';

/**
 * payrollSlice — client state for the payroll run wizard (M6).
 *
 * Flow: choose month → PREVIEW (server recomputes everything from attendance,
 * settings and tax slabs — the client only sends { year, month }, never
 * numbers) → review the draft table → create (HR/Admin) → finalize (Admin).
 * Finalized runs are locked in the database by triggers, so the UI can treat
 * 'finalized' as immutable.
 */

const initialState = {
  wizard: {
    step: 1, // 1 = pick period, 2 = review preview, 3 = created
    year: null,
    month: null,
  },
  /** Server-computed draft: { period, workingDays, payslips[], totals } */
  preview: null,
  previewStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  createStatus: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  finalizeStatus: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  error: null,
};

export const previewRun = createAsyncThunk(
  'payroll/previewRun',
  /**
   * @param {{ year: number, month: number }} payload
   */
  async (payload, { rejectWithValue }) => {
    const result = await previewPayrollRunAction(payload);
    if (!result?.ok) {
      return rejectWithValue(result?.error ?? { message: 'Preview failed.' });
    }
    return result.preview;
  },
);

export const createRun = createAsyncThunk(
  'payroll/createRun',
  /**
   * Server re-computes the run from scratch — the preview in Redux is display-
   * only. Payload is { year, month } only.
   */
  async ({ year, month }, { rejectWithValue }) => {
    const result = await createPayrollRunAction({ year, month });
    if (!result?.ok) return rejectWithValue(result?.error ?? { message: 'Create failed.' });
    return result;
  },
);

export const finalizeRun = createAsyncThunk(
  'payroll/finalizeRun',
  /**
   * @param {string} runId
   */
  async (runId, { rejectWithValue }) => {
    const result = await finalizePayrollRunAction(runId);
    if (!result?.ok) return rejectWithValue(result?.error ?? { message: 'Finalize failed.' });
    return result;
  },
);

const payrollSlice = createSlice({
  name: 'payroll',
  initialState,
  reducers: {
    setWizardStep(state, action) {
      state.wizard.step = action.payload;
    },
    setWizardPeriod(state, action) {
      const { year, month } = action.payload;
      state.wizard.year = year;
      state.wizard.month = month;
    },
    clearPreview(state) {
      state.preview = null;
      state.previewStatus = 'idle';
      state.error = null;
    },
    resetWizard(state) {
      return { ...initialState };
    },
    clearPayrollError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(previewRun.pending, (state) => {
        state.previewStatus = 'loading';
        state.error = null;
      })
      .addCase(previewRun.fulfilled, (state, action) => {
        state.previewStatus = 'ready';
        state.preview = action.payload;
        state.wizard.step = 2;
      })
      .addCase(previewRun.rejected, (state, action) => {
        state.previewStatus = 'error';
        state.error = action.payload ?? { message: 'Preview failed.' };
      })
      .addCase(createRun.pending, (state) => {
        state.createStatus = 'loading';
        state.error = null;
      })
      .addCase(createRun.fulfilled, (state) => {
        state.createStatus = 'success';
        state.wizard.step = 3;
      })
      .addCase(createRun.rejected, (state, action) => {
        state.createStatus = 'error';
        state.error = action.payload ?? { message: 'Create failed.' };
      })
      .addCase(finalizeRun.pending, (state) => {
        state.finalizeStatus = 'loading';
        state.error = null;
      })
      .addCase(finalizeRun.fulfilled, (state) => {
        state.finalizeStatus = 'success';
      })
      .addCase(finalizeRun.rejected, (state, action) => {
        state.finalizeStatus = 'error';
        state.error = action.payload ?? { message: 'Finalize failed.' };
      });
  },
});

export const {
  setWizardStep,
  setWizardPeriod,
  clearPreview,
  resetWizard,
  clearPayrollError,
} = payrollSlice.actions;

export default payrollSlice.reducer;
