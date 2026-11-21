import { Router } from 'express';
import db, { SEVERITIES, TEST_CASE_STATUSES } from './db.js';
import { ok, fail } from './api-response.js';
import { textTypeError, toId } from './validation.js';

// Test case endpoints, mounted at /api/test-cases.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const PAGE_SIZE = 20;
const SORTABLE = {
  updated: 'updated_at',
  severity: `CASE severity WHEN 'Critical' THEN 4 WHEN 'Major' THEN 3 WHEN 'Minor' THEN 2 ELSE 1 END`,
};

// Database row -> API shape.
export function toTestCase(row) {
  return {
    id: row.id,
    title: row.title,
    preconditions: row.preconditions,
    steps: JSON.parse(row.steps),
    expectedResult: row.expected_result,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Checks a create/update body. Returns { values } or { error }.
function validateTestCase(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be a JSON object' };

  const typeError = textTypeError(body, [
    ['title', 'Title'],
    ['preconditions', 'Preconditions'],
    ['expectedResult', 'Expected result'],
    ['severity', 'Severity'],
    ['status', 'Status'],
  ]);
  if (typeError) return { error: typeError };
  if (body.steps !== undefined && (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string'))) {
    return { error: 'Steps must be a list of text' };
  }

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const title = text(body.title);
  const preconditions = text(body.preconditions) || null;
  const expectedResult = text(body.expectedResult);
  const steps = Array.isArray(body.steps) ? body.steps.map(text).filter(Boolean) : [];
  const severity = body.severity;
  const status = body.status ?? 'draft';

  if (!title) return { error: 'Title is required' };
  if (title.length > 200) return { error: 'Title must be 200 characters or fewer' };
  if (steps.length === 0) return { error: 'At least one step is required' };
  if (!expectedResult) return { error: 'Expected result is required' };
  if (!SEVERITIES.includes(severity)) return { error: `Severity must be one of: ${SEVERITIES.join(', ')}` };
  if (!TEST_CASE_STATUSES.includes(status)) return { error: `Status must be one of: ${TEST_CASE_STATUSES.join(', ')}` };

  return { values: { title, preconditions, steps: JSON.stringify(steps), expected_result: expectedResult, severity, status } };
}

function findRow(id) {
  return db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
}

// GET /api/test-cases?page=1&status=ready&search=login&sort=updated|severity&order=asc|desc
function handleListTestCases(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  // Object.hasOwn, so names every object has (like "toString") don't count as sort options.
  const sortKey = Object.hasOwn(SORTABLE, req.query.sort ?? '') ? req.query.sort : 'updated';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const { status, search } = req.query;

  if (status && !TEST_CASE_STATUSES.includes(status)) {
    return fail(res, 400, `Status must be one of: ${TEST_CASE_STATUSES.join(', ')}`);
  }

  const where = [];
  const params = {};
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (search && search.trim()) {
    where.push("title LIKE @search ESCAPE '\\'");
    params.search = `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM test_cases ${whereSql}`).get(params);
  const rows = db
    .prepare(
      `SELECT * FROM test_cases ${whereSql}
       ORDER BY ${SORTABLE[sortKey]} ${order}, updated_at DESC, id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  ok(res, {
    items: rows.map(toTestCase),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

// GET /api/test-cases/:id
function handleGetTestCase(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Test case not found');
  ok(res, toTestCase(row));
}

// POST /api/test-cases
function handleCreateTestCase(req, res) {
  const { values, error } = validateTestCase(req.body);
  if (error) return fail(res, 400, error);

  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO test_cases (title, preconditions, steps, expected_result, severity, status, created_at, updated_at)
       VALUES (@title, @preconditions, @steps, @expected_result, @severity, @status, @now, @now)`
    )
    .run({ ...values, now });
  ok(res, toTestCase(findRow(lastInsertRowid)), 201);
}

// PUT /api/test-cases/:id (replaces all fields)
function handleUpdateTestCase(req, res) {
  if (!findRow(req.params.id)) return fail(res, 404, 'Test case not found');

  const { values, error } = validateTestCase(req.body);
  if (error) return fail(res, 400, error);

  db.prepare(
    `UPDATE test_cases
     SET title = @title, preconditions = @preconditions, steps = @steps, expected_result = @expected_result,
         severity = @severity, status = @status, updated_at = @now
     WHERE id = @id`
  ).run({ ...values, now: new Date().toISOString(), id: req.params.id });
  ok(res, toTestCase(findRow(req.params.id)));
}

// DELETE /api/test-cases/:id
function handleDeleteTestCase(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Test case not found');

  db.transaction(() => {
    // The suites this test case was in are changing too, so mark them updated.
    db.prepare(
      `UPDATE test_suites SET updated_at = ?
       WHERE id IN (SELECT suite_id FROM test_suite_cases WHERE test_case_id = ?)`
    ).run(new Date().toISOString(), req.params.id);
    db.prepare('DELETE FROM test_cases WHERE id = ?').run(req.params.id);
  })();
  ok(res, toTestCase(row));
}

// Only whole-number IDs reach the handlers; anything else, like "1.0" or "abc", is not found.
router.param('id', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Test case not found')));

router.get('/', handleListTestCases);
router.get('/:id', handleGetTestCase);
router.post('/', handleCreateTestCase);
router.put('/:id', handleUpdateTestCase);
router.delete('/:id', handleDeleteTestCase);

export default router;
