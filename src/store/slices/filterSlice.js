import { createSlice } from '@reduxjs/toolkit';

/**
 * filterSlice — BambooHR-style table/chart filters, one namespace per screen.
 *
 * Conventions:
 *   - Each scope is independent; components read their scope with
 *     useAppSelector((s) => s.filters.directory) and update via setFilter.
 *   - Setting any key other than 'page' resets page to 1 (classic table UX).
 *   - Data itself is NEVER stored here: filters are arguments for server
 *     fetches (server components/server actions). Optional: write-through to
 *     URL search params for shareable/refreshable views.
 *
 * @typedef {Object} DirectoryFilters
 * @property {string} search
 * @property {string} departmentId   'all' or uuid
 * @property {string} designationId  'all' or uuid
 * @property {string} status         'all' | 'probation' | 'active' | 'exited'
 * @property {string} sortBy
 * @property {'asc'|'desc'} sortDir
 * @property {number} page
 * @property {number} pageSize
 */

const makePagedScope = (extra = {}) => ({
  page: 1,
  pageSize: 10,
  sortBy: 'created_at',
  sortDir: 'desc',
  ...extra,
});

const initialState = {
  /** Employee directory (M3) */
  directory: makePagedScope({
    search: '',
    departmentId: 'all',
    designationId: 'all',
    status: 'all',
  }),

  /** Daily attendance board (M4, staff) */
  attendanceBoard: {
    date: null, // null = today (server resolves company-timezone date)
    departmentId: 'all',
    status: 'all',
  },

  /** Attendance corrections inbox (M4) */
  corrections: makePagedScope({ status: 'pending' }),

  /** Analytics/dashboards (M7) — date range + department, per the brief */
  analytics: {
    preset: 'last_30_days', // 'today' | 'this_week' | 'this_month' | 'last_30_days' | 'custom'
    from: null, // ISO date, used when preset === 'custom'
    to: null,
    departmentId: 'all',
  },

  /** Payroll runs (M6) */
  payroll: {
    year: null,
    month: null,
    status: 'all', // 'all' | 'draft' | 'finalized'
  },

  /** Audit log (M9, admin) */
  auditLog: makePagedScope({ search: '', action: '' }, ),

  /** Announcements (M9) */
  announcements: makePagedScope({ audience: 'all' }),
};

const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    /**
     * setFilter({ scope: 'directory', key: 'search', value: 'rafay' })
     * Page resets to 1 unless the changed key IS the page.
     */
    setFilter(state, action) {
      const { scope, key, value } = action.payload;
      const target = state[scope];
      if (!target) return;
      target[key] = value;
      if (key !== 'page' && 'page' in target) target.page = 1;
    },
    /** setFilters({ scope: 'analytics', patch: { from, to } }) */
    setFilters(state, action) {
      const { scope, patch } = action.payload;
      const target = state[scope];
      if (!target) return;
      Object.assign(target, patch);
      if (!('page' in patch) && 'page' in target) target.page = 1;
    },
    /** resetScope('directory') restores that scope's defaults */
    resetScope(state, action) {
      const scope = action.payload;
      if (initialState[scope]) {
        state[scope] = { ...initialState[scope] };
      }
    },
  },
});

export const { setFilter, setFilters, resetScope } = filterSlice.actions;

export const selectScopeFilters = (scope) => (state) =>
  state.filters[scope] ?? null;

export default filterSlice.reducer;
