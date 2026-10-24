import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getMyTodayAction,
  checkInAction,
  checkOutAction,
  submitCorrectionAction,
} from '@/actions/attendance-actions';

/**
 * attendanceSlice — client state for the employee's active attendance
 * workflow (check-in widget, optional camera gate, correction form).
 *
 * The attendance RECORDS themselves live in Postgres; boards/calendars fetch
 * them server-side. This slice holds only what the interactive widgets need
 * right now, plus camera-verification progress (bonus feature).
 *
 * checkIn/checkOut call the SECURITY DEFINER rpcs (web_check_in /
 * web_check_out) through server actions — the server stamps the time and
 * enforces the 409 / geofence / face rules; error codes (CM409, CM422…)
 * arrive here mapped to friendly copy.
 */

const initialState = {
  /** Today's row for the signed-in employee (from getMyTodayAction). */
  today: null, // { id, workDate, checkInAt, checkOutAt, status, checkInSource }
  todayStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'

  checkInPending: false,
  checkOutPending: false,
  error: null,

  /** Camera + location gate state (bonus; drives the check-in dialog UI). */
  camera: {
    gate: 'idle', // 'idle' | 'detecting' | 'ok' | 'no_face' | 'multiple_faces' | 'gps_low' | 'out_of_range'
    faceCount: 0,
    coords: null, // { latitude, longitude }
    accuracyM: null,
  },

  /** Correction request form state. */
  correction: {
    pending: false,
    error: null,
  },
};

export const fetchToday = createAsyncThunk('attendance/fetchToday', async () => {
  return await getMyTodayAction();
});

export const checkIn = createAsyncThunk(
  'attendance/checkIn',
  /**
   * @param {{ source?: 'web'|'camera', lat?: number, lng?: number,
   *           accuracyM?: number, faceCount?: number }} payload
   */
  async (payload, { rejectWithValue }) => {
    const result = await checkInAction(payload ?? {});
    if (!result?.ok) return rejectWithValue(result?.error ?? { message: 'Check-in failed.' });
    return result.attendance;
  },
);

export const checkOut = createAsyncThunk(
  'attendance/checkOut',
  async (payload, { rejectWithValue }) => {
    const result = await checkOutAction(payload ?? {});
    if (!result?.ok) return rejectWithValue(result?.error ?? { message: 'Check-out failed.' });
    return result.attendance;
  },
);

export const submitCorrection = createAsyncThunk(
  'attendance/submitCorrection',
  /**
   * @param {{ workDate: string, checkIn: string|null, checkOut: string|null,
   *           reason: string }} payload
   */
  async (payload, { rejectWithValue }) => {
    const result = await submitCorrectionAction(payload);
    if (!result?.ok) {
      return rejectWithValue(result?.error ?? { message: 'Could not submit correction.' });
    }
    return result;
  },
);

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    /** Called by the camera dialog as MediaPipe/face-api reports progress. */
    setCameraData(state, action) {
      const { faceCount, coords, accuracyM, gate } = action.payload;
      if (faceCount !== undefined) state.camera.faceCount = faceCount;
      if (coords !== undefined) state.camera.coords = coords;
      if (accuracyM !== undefined) state.camera.accuracyM = accuracyM;
      if (gate !== undefined) state.camera.gate = gate;
    },
    resetCamera(state) {
      state.camera = { gate: 'idle', faceCount: 0, coords: null, accuracyM: null };
    },
    clearAttendanceError(state) {
      state.error = null;
      state.correction.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Today's record
      .addCase(fetchToday.pending, (state) => {
        state.todayStatus = 'loading';
      })
      .addCase(fetchToday.fulfilled, (state, action) => {
        state.todayStatus = 'ready';
        state.today = action.payload?.ok ? action.payload.attendance : null;
      })
      .addCase(fetchToday.rejected, (state) => {
        state.todayStatus = 'error';
      })
      // Check-in / check-out
      .addCase(checkIn.pending, (state) => {
        state.checkInPending = true;
        state.error = null;
      })
      .addCase(checkIn.fulfilled, (state, action) => {
        state.checkInPending = false;
        state.today = action.payload;
      })
      .addCase(checkIn.rejected, (state, action) => {
        state.checkInPending = false;
        state.error = action.payload ?? { message: 'Check-in failed.' };
      })
      .addCase(checkOut.pending, (state) => {
        state.checkOutPending = true;
        state.error = null;
      })
      .addCase(checkOut.fulfilled, (state, action) => {
        state.checkOutPending = false;
        state.today = action.payload;
      })
      .addCase(checkOut.rejected, (state, action) => {
        state.checkOutPending = false;
        state.error = action.payload ?? { message: 'Check-out failed.' };
      })
      // Corrections
      .addCase(submitCorrection.pending, (state) => {
        state.correction.pending = true;
        state.correction.error = null;
      })
      .addCase(submitCorrection.fulfilled, (state) => {
        state.correction.pending = false;
      })
      .addCase(submitCorrection.rejected, (state, action) => {
        state.correction.pending = false;
        state.correction.error = action.payload ?? { message: 'Submission failed.' };
      });
  },
});

export const { setCameraData, resetCamera, clearAttendanceError } = attendanceSlice.actions;

export const selectIsCheckedIn = (state) =>
  Boolean(state.attendance.today?.checkInAt) && !state.attendance.today?.checkOutAt;
export const selectIsCheckedOut = (state) => Boolean(state.attendance.today?.checkOutAt);

export default attendanceSlice.reducer;
