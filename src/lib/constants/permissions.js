/**
 * Single source of truth for roles and route permissions.
 * Imported by BOTH the proxy (server-side route guard) and the sidebar
 * (client-side navigation) so the two can never drift. Hiding a menu item is
 * UX only — the real checks are RLS + services/guard.js + this proxy.
 */

export const ROLES = {
  ADMIN: 'admin',
  HR: 'hr',
  EMPLOYEE: 'employee',
};

export const ALL_ROLES = [ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE];
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.HR];

/**
 * Longest-prefix-match route guard evaluated in proxy.js on every request.
 * Routes not listed here require any authenticated, activated user.
 */
export const ROUTE_ROLES = [
  { prefix: '/organization/settings', roles: [ROLES.ADMIN] },
  { prefix: '/organization/users', roles: [ROLES.ADMIN] },
  { prefix: '/organization/tax-slabs', roles: [ROLES.ADMIN] },
  { prefix: '/organization', roles: STAFF_ROLES },
  { prefix: '/employees/new', roles: STAFF_ROLES },
  { prefix: '/employees/import', roles: [ROLES.HR] }, // CSV import is HR-only (checklist 08)
  { prefix: '/employees', roles: ALL_ROLES }, // /employees/[id] enforces "own" server-side
  { prefix: '/attendance/board', roles: STAFF_ROLES },
  { prefix: '/attendance', roles: ALL_ROLES },
  { prefix: '/payroll', roles: STAFF_ROLES },
  { prefix: '/payslips', roles: ALL_ROLES }, // "own" enforced server-side
  { prefix: '/audit-log', roles: [ROLES.ADMIN] },
  { prefix: '/dashboard', roles: ALL_ROLES },
];

/** Sidebar entries per role (BambooHR-style grouped navigation). */
export const NAV_ITEMS = {
  admin: [
    { label: 'Dashboard', href: '/dashboard' },
    {
      label: 'Organization',
      children: [
        { label: 'Settings', href: '/organization/settings' },
        { label: 'Departments', href: '/organization/departments' },
        { label: 'Designations', href: '/organization/designations' },
        { label: 'Holidays', href: '/organization/holidays' },
        { label: 'Tax slabs', href: '/organization/tax-slabs' },
        { label: 'Users & logins', href: '/organization/users' },
      ],
    },
    {
      label: 'People',
      children: [
        { label: 'Employee directory', href: '/employees' },
        { label: 'Attendance board', href: '/attendance/board' },
        { label: 'Corrections', href: '/attendance/corrections' },
      ],
    },
    {
      label: 'Payroll',
      children: [
        { label: 'Payroll runs', href: '/payroll' },
        { label: 'Payslips', href: '/payslips' },
      ],
    },
    { label: 'Announcements', href: '/announcements' },
    { label: 'Audit log', href: '/audit-log' },
  ],
  hr: [
    { label: 'Dashboard', href: '/dashboard' },
    {
      label: 'People',
      children: [
        { label: 'Employee directory', href: '/employees' },
        { label: 'Register employee', href: '/employees/new' },
        { label: 'CSV import', href: '/employees/import' },
        { label: 'Attendance board', href: '/attendance/board' },
        { label: 'Corrections', href: '/attendance/corrections' },
      ],
    },
    {
      label: 'Payroll',
      children: [
        { label: 'Payroll runs', href: '/payroll' },
        { label: 'Payslips', href: '/payslips' },
      ],
    },
    {
      label: 'Organization',
      children: [
        { label: 'Departments', href: '/organization/departments' },
        { label: 'Designations', href: '/organization/designations' },
        { label: 'Holidays', href: '/organization/holidays' },
      ],
    },
    { label: 'Announcements', href: '/announcements' },
  ],
  employee: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My attendance', href: '/attendance/my' },
    { label: 'Request correction', href: '/attendance/corrections' },
    { label: 'Directory', href: '/employees' },
    { label: 'My payslips', href: '/payslips' },
    { label: 'Announcements', href: '/announcements' },
    { label: 'Notifications', href: '/notifications' },
  ],
};

export function getDefaultRouteForRole(role) {
  return '/dashboard';
}

/** Longest-prefix match against ROUTE_ROLES; returns true when allowed. */
export function hasRouteAccess(pathname, role) {
  const matches = ROUTE_ROLES.filter((r) => pathname.startsWith(r.prefix));
  if (matches.length === 0) return true;
  const rule = matches.reduce((a, b) => (b.prefix.length > a.prefix.length ? b : a));
  return rule.roles.includes(role);
}
