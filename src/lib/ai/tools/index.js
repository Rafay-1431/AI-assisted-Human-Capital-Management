import peopleTools from './definitions/people-tools.js';
import attendanceTools from './definitions/attendance-tools.js';
import payrollTools from './definitions/payroll-tools.js';

/**
 * Tool registry (M8). Every tool reuses the SAME services and permission
 * checks as the REST/actions layer — the model never touches the database
 * directly, and it never writes data (all tools are read-only).
 *
 * Module 5 (Leave) tools from the brief (get_leave_summary,
 * get_my_leave_balance, smart-leave) are intentionally absent.
 *
 * permission:
 *   'staff' → admin + hr only
 *   'all'   → any role (executes strictly within the caller's own data scope)
 */

const PERMISSION_MAP = {
  all: ['admin', 'hr', 'employee'],
  staff: ['admin', 'hr'],
};

export const ALL_TOOLS = [...peopleTools, ...attendanceTools, ...payrollTools];

/** Tools the given role is allowed to invoke. */
export function toolsForRole(role) {
  return ALL_TOOLS.filter((tool) => (PERMISSION_MAP[tool.permission] ?? []).includes(role));
}

/** @returns {object|undefined} */
export function getTool(name) {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
