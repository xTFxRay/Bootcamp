import { Router } from 'express';
import db, { PAGE_SIZES, SEVERITIES, THEMES } from '../db.js';
import { ok, fail } from '../api-response.js';

// Settings endpoints, mounted at /api/settings.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

// There is one user for now. When sign-in exists, this becomes the signed-in user's ID.
const CURRENT_USER_ID = 1;

const DEFAULTS = {
  theme: 'system',
  default_severity_for_new_bugs: 'Minor',
  default_page_size: 20,
  timezone: null,
  auto_generate_report_after_run: 1,
};

// API field -> database column, with the check for each value. Each check returns an error or null.
const FIELDS = {
  theme: {
    column: 'theme',
    check: (v) => (THEMES.includes(v) ? null : `Theme must be one of: ${THEMES.join(', ')}`),
  },
  defaultSeverityForNewBugs: {
    column: 'default_severity_for_new_bugs',
    check: (v) => (SEVERITIES.includes(v) ? null : `Default severity for new bugs must be one of: ${SEVERITIES.join(', ')}`),
  },
  defaultPageSize: {
    column: 'default_page_size',
    check: (v) => (PAGE_SIZES.includes(v) ? null : `Default page size must be one of: ${PAGE_SIZES.join(', ')}`),
  },
  timezone: {
    column: 'timezone',
    // null = follow the browser; otherwise a time zone name the server knows, like "Europe/Riga".
    check: (v) => (v === null || isTimeZone(v) ? null : 'Time zone must be a time zone name like "Europe/Riga", or null to use the browser\'s'),
  },
  autoGenerateReportAfterRun: {
    column: 'auto_generate_report_after_run',
    check: (v) => (typeof v === 'boolean' ? null : 'Auto-generate report after run must be true or false'),
    toDb: (v) => (v ? 1 : 0),
  },
};

function isTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function toSettings(row) {
  const r = row ?? { ...DEFAULTS, updated_at: null };
  return {
    theme: r.theme,
    defaultSeverityForNewBugs: r.default_severity_for_new_bugs,
    defaultPageSize: r.default_page_size,
    timezone: r.timezone,
    autoGenerateReportAfterRun: r.auto_generate_report_after_run === 1,
    updatedAt: r.updated_at, // null until the settings are first saved
  };
}

const findRow = () => db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(CURRENT_USER_ID);

// GET /api/settings -> the current user's settings (defaults when never saved), plus the allowed values.
function handleGetSettings(req, res) {
  ok(res, { settings: toSettings(findRow()), options: { themes: THEMES, severities: SEVERITIES, pageSizes: PAGE_SIZES } });
}

// PUT /api/settings  { theme?, defaultSeverityForNewBugs?, defaultPageSize?, timezone?, autoGenerateReportAfterRun? }
// Changes only the fields sent; the others keep their saved (or default) value.
function handleUpdateSettings(req, res) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'Request body must be a JSON object');
  const unknown = Object.keys(body).filter((k) => !Object.hasOwn(FIELDS, k));
  if (unknown.length) return fail(res, 400, `Unknown setting: ${unknown.join(', ')}. Allowed: ${Object.keys(FIELDS).join(', ')}`);
  if (Object.keys(body).length === 0) return fail(res, 400, 'Send at least one setting to change');

  for (const [key, value] of Object.entries(body)) {
    const error = FIELDS[key].check(value);
    if (error) return fail(res, 400, error);
  }

  const current = findRow() ?? { ...DEFAULTS };
  const next = { ...current, user_id: CURRENT_USER_ID, updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(body)) {
    const field = FIELDS[key];
    next[field.column] = field.toDb ? field.toDb(value) : value;
  }

  db.prepare(
    `INSERT INTO user_preferences (user_id, theme, default_severity_for_new_bugs, default_page_size, timezone,
                                   auto_generate_report_after_run, updated_at)
     VALUES (@user_id, @theme, @default_severity_for_new_bugs, @default_page_size, @timezone,
             @auto_generate_report_after_run, @updated_at)
     ON CONFLICT (user_id) DO UPDATE SET
       theme = excluded.theme,
       default_severity_for_new_bugs = excluded.default_severity_for_new_bugs,
       default_page_size = excluded.default_page_size,
       timezone = excluded.timezone,
       auto_generate_report_after_run = excluded.auto_generate_report_after_run,
       updated_at = excluded.updated_at`
  ).run(next);

  ok(res, { settings: toSettings(findRow()), options: { themes: THEMES, severities: SEVERITIES, pageSizes: PAGE_SIZES } });
}

router.get('/', handleGetSettings);
router.put('/', handleUpdateSettings);

export default router;
