import { useDispatch, useSelector, useStore } from 'react-redux';

/**
 * Thin re-exports with JSDoc types (JavaScript project — no TS annotations,
 * but editors still get full inference via the store shape).
 *
 * @typedef {ReturnType<typeof import('./store').makeStore>} AppStore
 * @typedef {ReturnType<AppStore['getState']>} RootState
 * @typedef {AppStore['dispatch']} AppDispatch
 */

/** @returns {AppDispatch} */
export const useAppDispatch = useDispatch;

/**
 * @template TSelected
 * @param {(state: RootState) => TSelected} selector
 * @returns {TSelected}
 */
export const useAppSelector = useSelector;

/** @returns {AppStore} */
export const useAppStore = useStore;

// ── Common selectors ─────────────────────────────────────────────────────────
export const selectAuth = (state) => state.auth;
export const selectRole = (state) => state.auth.role;
export const selectProfile = (state) => state.auth.profile;
export const selectUI = (state) => state.ui;
export const selectFilters = (state) => state.filters;
