import { Router } from 'express';
import db, { TEST_SUITE_STATUSES } from './db.js';
import { ok, fail } from './api-response.js';
import { toTestCase } from './test-cases.js';

// Test suite endpoints, mounted at /api/test-suites.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const statusError = `Status must be one of: ${TEST_SUITE_STATUSES.join(', ')}`;

// Database row -> API shape.
function toTestSuite(row) {
  return {
    id: row.id,
    name: row.name,
    feature: row.feature,
    status: row.status,
    caseCount: row.case_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUITE_SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM test_suite_cases l WHERE l.suite_id = s.id) AS case_count
  FROM test_suites s`;

function findSuite(id) {
  return db.prepare(`${SUITE_SELECT} WHERE s.id = ?`).get(id);
}

function suiteCases(suiteId) {
  return db
    .prepare(
      `SELECT c.*, l.sort_order FROM test_suite_cases l
       JOIN test_cases c ON c.id = l.test_case_id
       WHERE l.suite_id = ?
       ORDER BY l.sort_order`
    )
    .all(suiteId)
    .map((row) => ({ ...toTestCase(row), sortOrder: row.sort_order }));
}

// The full suite with its test cases in order.
function suiteWithCases(id) {
  return { ...toTestSuite(findSuite(id)), cases: suiteCases(id) };
}

function touchSuite(id) {
  db.prepare('UPDATE test_suites SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

// Checks a create/update body. Returns { values } or { error }.
function validateTestSuite(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be a JSON object' };

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = text(body.name);
  const feature = text(body.feature);
  const status = body.status ?? 'draft';

  if (!name) return { error: 'Name is required' };
  if (name.length > 120) return { error: 'Name must be 120 characters or fewer' };
  if (!feature) return { error: 'Feature is required' };
  if (feature.length > 80) return { error: 'Feature must be 80 characters or fewer' };
  if (!TEST_SUITE_STATUSES.includes(status)) return { error: statusError };

  return { values: { name, feature, status } };
}

// A whole number above 0, or null.
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/test-suites?status=ready
function handleListTestSuites(req, res) {
  const { status } = req.query;
  if (status && !TEST_SUITE_STATUSES.includes(status)) return fail(res, 400, statusError);

  const rows = status
    ? db.prepare(`${SUITE_SELECT} WHERE s.status = ? ORDER BY s.updated_at DESC, s.id DESC`).all(status)
    : db.prepare(`${SUITE_SELECT} ORDER BY s.updated_at DESC, s.id DESC`).all();
  ok(res, rows.map(toTestSuite));
}

// GET /api/test-suites/:id
function handleGetTestSuite(req, res) {
  if (!findSuite(req.params.id)) return fail(res, 404, 'Test suite not found');
  ok(res, suiteWithCases(req.params.id));
}

// POST /api/test-suites
function handleCreateTestSuite(req, res) {
  const { values, error } = validateTestSuite(req.body);
  if (error) return fail(res, 400, error);

  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO test_suites (name, feature, status, created_at, updated_at)
       VALUES (@name, @feature, @status, @now, @now)`
    )
    .run({ ...values, now });
  ok(res, suiteWithCases(lastInsertRowid), 201);
}

// PUT /api/test-suites/:id (replaces name, feature and status)
function handleUpdateTestSuite(req, res) {
  if (!findSuite(req.params.id)) return fail(res, 404, 'Test suite not found');

  const { values, error } = validateTestSuite(req.body);
  if (error) return fail(res, 400, error);

  db.prepare(
    `UPDATE test_suites SET name = @name, feature = @feature, status = @status, updated_at = @now WHERE id = @id`
  ).run({ ...values, now: new Date().toISOString(), id: req.params.id });
  ok(res, suiteWithCases(req.params.id));
}

// DELETE /api/test-suites/:id (the test cases themselves are kept)
function handleDeleteTestSuite(req, res) {
  const row = findSuite(req.params.id);
  if (!row) return fail(res, 404, 'Test suite not found');

  db.prepare('DELETE FROM test_suites WHERE id = ?').run(req.params.id);
  ok(res, toTestSuite(row));
}

// POST /api/test-suites/:id/cases  { testCaseId } -> adds it at the end
function handleAddTestSuiteCase(req, res) {
  const suiteId = req.params.id;
  if (!findSuite(suiteId)) return fail(res, 404, 'Test suite not found');

  const testCaseId = toId(req.body?.testCaseId);
  if (!testCaseId) return fail(res, 400, 'testCaseId must be a test case ID number');
  if (!db.prepare('SELECT 1 FROM test_cases WHERE id = ?').get(testCaseId)) {
    return fail(res, 404, 'Test case not found');
  }
  if (db.prepare('SELECT 1 FROM test_suite_cases WHERE suite_id = ? AND test_case_id = ?').get(suiteId, testCaseId)) {
    return fail(res, 409, 'This test case is already in the suite');
  }

  db.transaction(() => {
    const { next } = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM test_suite_cases WHERE suite_id = ?')
      .get(suiteId);
    db.prepare('INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)').run(
      suiteId,
      testCaseId,
      next
    );
    touchSuite(suiteId);
  })();
  ok(res, suiteWithCases(suiteId), 201);
}

// DELETE /api/test-suites/:id/cases/:testCaseId (the test case itself is kept)
function handleRemoveTestSuiteCase(req, res) {
  const { id: suiteId, testCaseId } = req.params;
  if (!findSuite(suiteId)) return fail(res, 404, 'Test suite not found');

  const removed = db.transaction(() => {
    const { changes } = db
      .prepare('DELETE FROM test_suite_cases WHERE suite_id = ? AND test_case_id = ?')
      .run(suiteId, testCaseId);
    if (changes === 0) return false;
    renumber(suiteId, suiteCases(suiteId).map((c) => c.id));
    touchSuite(suiteId);
    return true;
  })();

  if (!removed) return fail(res, 404, 'This test case is not in the suite');
  ok(res, suiteWithCases(suiteId));
}

// PUT /api/test-suites/:id/order  { testCaseIds: [3, 1, 2] }
// The list must contain exactly the suite's current test cases, in the new order.
function handleReorderTestSuiteCases(req, res) {
  const suiteId = req.params.id;
  if (!findSuite(suiteId)) return fail(res, 404, 'Test suite not found');

  const ids = req.body?.testCaseIds;
  if (!Array.isArray(ids) || ids.some((id) => !toId(id))) {
    return fail(res, 400, 'testCaseIds must be a list of test case ID numbers');
  }
  const newOrder = ids.map(Number);
  const current = suiteCases(suiteId).map((c) => c.id);
  const sameSet =
    newOrder.length === current.length &&
    new Set(newOrder).size === newOrder.length &&
    newOrder.every((id) => current.includes(id));
  if (!sameSet) {
    return fail(res, 400, "testCaseIds must list each of the suite's test cases exactly once");
  }

  db.transaction(() => {
    renumber(suiteId, newOrder);
    touchSuite(suiteId);
  })();
  ok(res, suiteWithCases(suiteId));
}

// Sets sort_order to 1, 2, 3... following the given test case IDs.
function renumber(suiteId, testCaseIds) {
  const update = db.prepare('UPDATE test_suite_cases SET sort_order = ? WHERE suite_id = ? AND test_case_id = ?');
  testCaseIds.forEach((caseId, i) => update.run(i + 1, suiteId, caseId));
}

router.get('/', handleListTestSuites);
router.get('/:id', handleGetTestSuite);
router.post('/', handleCreateTestSuite);
router.put('/:id', handleUpdateTestSuite);
router.delete('/:id', handleDeleteTestSuite);
router.post('/:id/cases', handleAddTestSuiteCase);
router.delete('/:id/cases/:testCaseId', handleRemoveTestSuiteCase);
router.put('/:id/order', handleReorderTestSuiteCases);

export default router;
