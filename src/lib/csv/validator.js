/**
 * CSV import validator (M3) — pure functions, unit-testable, server-side.
 *
 * Checks per the brief: required fields, unique code/email (in-file AND
 * against the DB), valid email, known department, ISO dates, salary > 0.
 * The dry run returns { row, field, reason } errors; nothing is written
 * until the caller explicitly commits the valid rows.
 */

export const REQUIRED_COLUMNS = ['employee_code', 'full_name', 'email', 'department', 'join_date', 'basic_salary'];
const OPTIONAL_COLUMNS = ['designation', 'gender', 'date_of_birth', 'phone', 'address'];
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = ['male', 'female', 'other'];

/**
 * Quote-aware CSV parser (RFC-4180 subset: double-quote escaping, no
 * multi-line cells). Returns headers + rows keyed by header.
 * @param {string} text
 */
export function parseCsv(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const cells = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(cell.trim()); cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line, idx) => {
    const cells = splitLine(line);
    const data = {};
    headers.forEach((h, i) => { data[h] = cells[i] ?? ''; });
    return { line: idx + 2, data }; // line 1 is the header
  });
  return { headers, rows };
}

/**
 * @param {{ line: number, data: Record<string, string> }} row
 * @param {{ existingCodes: string[], existingEmails: string[], departments: string[] }} ctx
 */
export function validateRow(row, ctx) {
  const d = row.data;
  const errors = [];
  const check = (field, ok, reason) => { if (!ok) errors.push({ row: row.line, field, reason }); };

  for (const col of REQUIRED_COLUMNS) {
    check(col, Boolean(d[col]), `${col} is required`);
  }

  const code = (d.employee_code ?? '').toLowerCase();
  const email = (d.email ?? '').toLowerCase();
  check('employee_code', code && !ctx.existingCodes.includes(code), code ? `employee_code "${d.employee_code}" already exists` : 'empty');
  check('email', EMAIL_RE.test(d.email ?? ''), 'invalid email format');
  check('email', email && !ctx.existingEmails.includes(email), email ? `email "${d.email}" already exists` : 'empty');
  check(
    'department',
    ctx.departments.map((x) => x.toLowerCase()).includes((d.department ?? '').toLowerCase()),
    `unknown department "${d.department}"`,
  );
  check('join_date', ISO_DATE_RE.test(d.join_date ?? '') && !Number.isNaN(Date.parse(d.join_date)), 'must be ISO date (YYYY-MM-DD)');
  const salary = Number(d.basic_salary);
  check('basic_salary', Number.isFinite(salary) && salary > 0, 'must be a number > 0');

  if (d.gender) check('gender', GENDERS.includes(d.gender.toLowerCase()), 'male, female or other');
  if (d.date_of_birth) check('date_of_birth', ISO_DATE_RE.test(d.date_of_birth), 'must be ISO date (YYYY-MM-DD)');

  return errors;
}

/**
 * Full dry run over parsed rows: per-row validation + in-file duplicates.
 * @returns {{ valid: object[], errors: { row: number, field: string, reason: string }[] }}
 */
export function validateCsvRows(rows, ctx) {
  const errors = [];
  const seenCodes = new Set();
  const seenEmails = new Set();

  for (const row of rows) {
    errors.push(...validateRow(row, ctx));
    const code = (row.data.employee_code ?? '').toLowerCase();
    const email = (row.data.email ?? '').toLowerCase();
    if (code) {
      if (seenCodes.has(code)) errors.push({ row: row.line, field: 'employee_code', reason: `duplicate in file: "${row.data.employee_code}"` });
      seenCodes.add(code);
    }
    if (email) {
      if (seenEmails.has(email)) errors.push({ row: row.line, field: 'email', reason: `duplicate in file: "${row.data.email}"` });
      seenEmails.add(email);
    }
  }

  const badLines = new Set(errors.map((e) => e.row));
  return {
    valid: rows.filter((r) => !badLines.has(r.line)).map((r) => r.data),
    errors,
  };
}
