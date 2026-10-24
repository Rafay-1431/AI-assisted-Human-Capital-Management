import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getSessionAction,
  signInAction,
  signOutAction,
  changePasswordAction,
} from '@/actions/auth-actions';

/**
 * authSlice — client mirror of the server session.
 *
 * The SERVER (Supabase session + profiles row) is the source of truth; this
 * slice is hydrated from server-fetched props (SessionSync) and updated after
 * auth actions. It exists so client components (sidebar, chat panel, widgets)
 * can read role/profile without prop-drilling.
 *
 * NEVER gate security on this state — every server action re-validates.
 *
 * State shape:
 *   status: 'idle' | 'loading' | 'authenticated' | 'guest'
 *   user:    { id, email }            (Supabase auth user)
 *   profile: { id, fullName, role, isActive, mustChangePassword, email }
 *   role:    'admin' | 'hr' | 'employee' | 'guest'
 */

const initialState = {
  status: 'idle',
  user: null,
  profile: null,
  role: 'guest',
  error: null,
};

export const initializeSession = createAsyncThunk('auth/initialize', async () => {
  return await getSessionAction(); // { ok, user, profile } | { ok: false }
});

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (credentials, { rejectWithValue }) => {
    const result = await signInAction(credentials);
    if (!result?.ok) return rejectWithValue(result?.error ?? { message: 'Sign-in failed.' });
    return result;
  },
);

export const signOut = createAsyncThunk('auth/signOut', async () => {
  await signOutAction();
});

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (payload, { rejectWithValue }) => {
    const result = await changePasswordAction(payload);
    if (!result?.ok) {
      return rejectWithValue(result?.error ?? { message: 'Password change failed.' });
    }
    return result;
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched by <SessionSync profile={...}/> after server fetches. */
    profileSynced(state, action) {
      const profile = action.payload;
      state.profile = profile;
      state.role = profile?.role ?? 'guest';
      if (profile) state.status = 'authenticated';
    },
    /** Dispatched by the supabase.auth.onAuthStateChange listener on SIGNED_OUT. */
    sessionCleared(state) {
      state.status = 'guest';
      state.user = null;
      state.profile = null;
      state.role = 'guest';
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload.user ?? null;
        state.profile = action.payload.profile ?? null;
        state.role = action.payload.profile?.role ?? 'guest';
      })
      .addCase(signIn.rejected, (state, action) => {
        state.status = 'guest';
        state.error = action.payload ?? { message: 'Sign-in failed.' };
      })
      .addCase(signOut.fulfilled, (state) => {
        state.status = 'guest';
        state.user = null;
        state.profile = null;
        state.role = 'guest';
      })
      .addCase(initializeSession.fulfilled, (state, action) => {
        if (action.payload?.ok && action.payload.profile) {
          state.status = 'authenticated';
          state.user = action.payload.user ?? null;
          state.profile = action.payload.profile;
          state.role = action.payload.profile.role ?? 'guest';
        } else {
          state.status = 'guest';
        }
      })
      .addCase(changePassword.fulfilled, (state) => {
        if (state.profile) state.profile.mustChangePassword = false;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.error = action.payload ?? { message: 'Password change failed.' };
      });
  },
});

export const { profileSynced, sessionCleared, clearAuthError } = authSlice.actions;

// ── Selectors ────────────────────────────────────────────────────────────────
export const selectIsAuthenticated = (state) => state.auth.status === 'authenticated';
export const selectIsStaff = (state) => ['admin', 'hr'].includes(state.auth.role);

export default authSlice.reducer;
