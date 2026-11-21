import { Router } from 'express';
import db, { SEVERITIES, BUG_STATUSES, BUG_PRIORITIES } from './db.js';
import { ok, fail } from './api-response.js';
import { textTypeError, toId } from './validation.js';

// Bug tracker endpoints, mounted at /api/bugs.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const PAGE_SIZE = 20;

// Allowed status changes (CLAUDE.md). Anything else is rejected.
export const BUG_TRANSITIONS = {
  open: ['in-progress', 'closed'],
  'in-progress': ['resolved', 'closed'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['in-progress', 'closed'],
};

const LIMITS = { title: 200, description: 5000, expected: 2000, actual: 2000, environment: 200, step: 500, steps: 50, message: 2000 };

const SEVERITY_RANK = `CASE severity WHEN 'Critical' THEN 4 WHEN 'Major' THEN 3 WHEN 'Minor' THEN 2 ELSE 1 END`;
const PRIORITY_RANK = `CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;
const SORTABLE = {
  updated: 'updated_at',
  created: 'created_at',
  severity: SEVERITY_RANK,
  priority: PRIORITY_RANK,
  title: 'title COLLATE NOCASE',
};

const oneOf = (values) => values.join(', ');

// Database row -> API shape.
function toBug(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    priority: row.priority,
    status: row.status,
    steps: JSON.parse(row.steps),
    expected: row.expected,
    actual: row.actual,
    environment: row.environment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toActivity(row) {
  return {
    id: row.id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    message: row.message,
    timestamp: row.created_at,
  };
}

function findRow(id) {
  return db.prepare('SELECT * FROM bugs WHERE id = ?').get(id);
}

// The full bug: fields, activity history (oldest first) and the statuses it can move to next.
function bugWithDetails(id) {
  const bug = toBug(findRow(id));
  const activity = db
    .prepare('SELECT * FROM bug_activity WHERE bug_id = ? ORDER BY created_at, id')
    .all(id)
    .map(toActivity);
  return { ...bug, activity, allowedStatuses: BUG_TRANSITIONS[bug.status] };
}

function addActivity(bugId, { action, oldValue = null, newValue = null, message = null, at }) {
  db.prepare(
    'INSERT INTO bug_activity (bug_id, action, old_value, new_value, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(bugId, action, oldValue, newValue, message, at);
}

// Checks a create/update body. Returns { values } or { error }.
// Status is never set here: new bugs start open, and changes go through PATCH /:id/status.
function validateBug(body, { isCreate }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object' };

  const typeError = textTypeError(body, [
    ['title', 'Title'],
    ['description', 'Description'],
    ['expected', 'Expected'],
    ['actual', 'Actual'],
    ['environment', 'Environment'],
    ['severity', 'Severity'],
    ['priority', 'Priority'],
  ]);
  if (typeError) return { error: typeError };
  if (body.steps !== undefined && (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string'))) {
    return { error: 'Steps to reproduce must be a list of text' };
  }
  if (body.status !== undefined) {
    return {
      error: isCreate
        ? 'New bugs always start as open; leave status out'
        : 'Change the status with PATCH /api/bugs/:id/status, not here',
    };
  }

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const values = {
    title: text(body.title),
    description: text(body.description) || null,
    steps: Array.isArray(body.steps) ? body.steps.map(text).filter(Boolean) : [],
    expected: text(body.expected),
    actual: text(body.actual),
    environment: text(body.environment) || null,
    severity: body.severity,
    priority: body.priority ?? (isCreate ? 'medium' : undefined),
  };

  if (!values.title) return { error: 'Title is required' };
  if (values.steps.length === 0) return { error: 'At least one step to reproduce is required' };
  if (!values.expected) return { error: 'Expected is required' };
  if (!values.actual) return { error: 'Actual is required' };
  if (!SEVERITIES.includes(values.severity)) return { error: `Severity must be one of: ${oneOf(SEVERITIES)}` };
  if (values.priority === undefined) return { error: 'Priority is required' };
  if (!BUG_PRIORITIES.includes(values.priority)) return { error: `Priority must be one of: ${oneOf(BUG_PRIORITIES)}` };

  for (const field of ['title', 'description', 'expected', 'actual', 'environment']) {
    if (values[field] && values[field].length > LIMITS[field]) {
      const label = field[0].toUpperCase() + field.slice(1);
      return { error: `${label} must be ${LIMITS[field]} characters or fewer` };
    }
  }
  if (values.steps.length > LIMITS.steps) return { error: `There can be at most ${LIMITS.steps} steps to reproduce` };
  if (values.steps.some((s) => s.length > LIMITS.step)) {
    return { error: `Each step to reproduce must be ${LIMITS.step} characters or fewer` };
  }

  return { values: { ...values, steps: JSON.stringify(values.steps) } };
}

// GET /api/bugs?status=&severity=&priority=&search=&sort=updated|created|severity|priority|title&order=asc|desc&page=1
function handleListBugs(req, res) {
  const query = req.query;
  for (const key of ['status', 'severity', 'priority', 'search', 'sort', 'order', 'page']) {
    if (query[key] !== undefined && typeof query[key] !== 'string') {
      return fail(res, 400, `Only one "${key}" value is allowed`);
    }
  }
  const { status, severity, priority, search } = query;
  if (status && !BUG_STATUSES.includes(status)) return fail(res, 400, `Status must be one of: ${oneOf(BUG_STATUSES)}`);
  if (severity && !SEVERITIES.includes(severity)) return fail(res, 400, `Severity must be one of: ${oneOf(SEVERITIES)}`);
  if (priority && !BUG_PRIORITIES.includes(priority)) {
    return fail(res, 400, `Priority must be one of: ${oneOf(BUG_PRIORITIES)}`);
  }
  const sortKey = query.sort ?? 'updated';
  if (!Object.hasOwn(SORTABLE, sortKey)) return fail(res, 400, `Sort must be one of: ${oneOf(Object.keys(SORTABLE))}`);
  const order = query.order ?? (sortKey === 'title' ? 'asc' : 'desc');
  if (order !== 'asc' && order !== 'desc') return fail(res, 400, 'Order must be asc or desc');
  const page = query.page === undefined ? 1 : toId(query.page);
  if (!page) return fail(res, 400, 'Page must be a whole number, 1 or more');

  const where = [];
  const params = {};
  if (status) (where.push('status = @status'), (params.status = status));
  if (severity) (where.push('severity = @severity'), (params.severity = severity));
  if (priority) (where.push('priority = @priority'), (params.priority = priority));
  if (search && search.trim()) {
    where.push("(title LIKE @search ESCAPE '\\' OR description LIKE @search ESCAPE '\\')");
    params.search = `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bugs ${whereSql}`).get(params);
  const rows = db
    .prepare(
      `SELECT * FROM bugs ${whereSql}
       ORDER BY ${SORTABLE[sortKey]} ${order.toUpperCase()}, updated_at DESC, id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  ok(res, {
    items: rows.map(toBug),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

// GET /api/bugs/:id (with activity and allowedStatuses)
function handleGetBug(req, res) {
  if (!findRow(req.params.id)) return fail(res, 404, 'Bug not found');
  ok(res, bugWithDetails(req.params.id));
}

// POST /api/bugs (always starts as open)
function handleCreateBug(req, res) {
  const { values, error } = validateBug(req.body, { isCreate: true });
  if (error) return fail(res, 400, error);

  const now = new Date().toISOString();
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO bugs (title, description, severity, priority, status, steps, expected, actual, environment, created_at, updated_at)
         VALUES (@title, @description, @severity, @priority, 'open', @steps, @expected, @actual, @environment, @now, @now)`
      )
      .run({ ...values, now });
    addActivity(lastInsertRowid, { action: 'created', newValue: 'open', at: now });
    return lastInsertRowid;
  })();
  ok(res, bugWithDetails(id), 201);
}

// PUT /api/bugs/:id (replaces every field except status; all required fields must be sent)
function handleUpdateBug(req, res) {
  if (!findRow(req.params.id)) return fail(res, 404, 'Bug not found');

  const { values, error } = validateBug(req.body, { isCreate: false });
  if (error) return fail(res, 400, error);

  db.prepare(
    `UPDATE bugs SET title = @title, description = @description, severity = @severity, priority = @priority,
       steps = @steps, expected = @expected, actual = @actual, environment = @environment, updated_at = @now
     WHERE id = @id`
  ).run({ ...values, now: new Date().toISOString(), id: req.params.id });
  ok(res, bugWithDetails(req.params.id));
}

// DELETE /api/bugs/:id (its activity history goes with it)
function handleDeleteBug(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Bug not found');

  db.prepare('DELETE FROM bugs WHERE id = ?').run(req.params.id);
  ok(res, toBug(row));
}

// PATCH /api/bugs/:id/status  { status, message? }
function handleChangeBugStatus(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Bug not found');

  const body = req.body ?? {};
  const typeError = textTypeError(body, [
    ['status', 'Status'],
    ['message', 'Message'],
  ]);
  if (typeError) return fail(res, 400, typeError);
  const { status } = body;
  if (!status) return fail(res, 400, 'Status is required');
  if (!BUG_STATUSES.includes(status)) return fail(res, 400, `Status must be one of: ${oneOf(BUG_STATUSES)}`);
  const message = (body.message ?? '').trim() || null;
  if (message && message.length > LIMITS.message) {
    return fail(res, 400, `Message must be ${LIMITS.message} characters or fewer`);
  }

  const allowed = BUG_TRANSITIONS[row.status];
  if (!allowed.includes(status)) {
    return fail(
      res,
      409,
      status === row.status
        ? `The bug is already ${row.status}.`
        : `A bug can't go from ${row.status} to ${status}. From ${row.status} it can go to: ${oneOf(allowed)}.`
    );
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE bugs SET status = ?, updated_at = ? WHERE id = ?').run(status, now, row.id);
    addActivity(row.id, { action: 'status_change', oldValue: row.status, newValue: status, message, at: now });
  })();
  ok(res, bugWithDetails(row.id));
}

// POST /api/bugs/:id/comments  { message }
function handleAddBugComment(req, res) {
  if (!findRow(req.params.id)) return fail(res, 404, 'Bug not found');

  const body = req.body ?? {};
  const typeError = textTypeError(body, [['message', 'Comment']]);
  if (typeError) return fail(res, 400, typeError);
  const message = (body.message ?? '').trim();
  if (!message) return fail(res, 400, 'Comment is required');
  if (message.length > LIMITS.message) return fail(res, 400, `Comment must be ${LIMITS.message} characters or fewer`);

  const now = new Date().toISOString();
  db.transaction(() => {
    addActivity(req.params.id, { action: 'comment', message, at: now });
    db.prepare('UPDATE bugs SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  })();
  ok(res, bugWithDetails(req.params.id), 201);
}

// Only whole-number IDs reach the handlers; anything else, like "1.0" or "abc", is not found.
router.param('id', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Bug not found')));

router.get('/', handleListBugs);
router.get('/:id', handleGetBug);
router.post('/', handleCreateBug);
router.put('/:id', handleUpdateBug);
router.delete('/:id', handleDeleteBug);
router.patch('/:id/status', handleChangeBugStatus);
router.post('/:id/comments', handleAddBugComment);

export default router;
