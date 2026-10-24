import { configureStore } from '@reduxjs/toolkit';

import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import filterReducer from './slices/filterSlice';
import attendanceReducer from './slices/attendanceSlice';
import payrollReducer from './slices/payrollSlice';

/**
 * Redux Toolkit store — client-side state ONLY.
 *
 * Division of responsibility (important, prevents double source-of-truth bugs):
 *   - Supabase/Postgres (via server components + server actions) is the source
 *     of truth for ALL business data. RLS protects it.
 *   - Redux caches session/UI state and ephemeral client workflows. It is
 *     never consulted for authorization decisions.
 *
 * makeStore() is exported so StoreProvider can create one store per browser
 * session; see StoreProvider.jsx for the App Router pattern.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      ui: uiReducer,
      filters: filterReducer,
      attendance: attendanceReducer,
      payroll: payrollReducer,
    },
    devTools: process.env.NODE_ENV !== 'production',
  });
}
