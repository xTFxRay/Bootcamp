import express, { Router } from 'express';
import db, { SEVERITIES, TEST_CASE_STATUSES } from './db.js';
import { ok, fail } from './api-response.js';
import { textTypeError, toId } from './validation.js';
import { analyzeCsv, CHOOSABLE_ENCODINGS, MAX_FILE_BYTES } from './test-case-import.js';

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

// Checks a create/update body. Returns { values, errors }: every problem found, in a fixed order
// (the form shows the first; the CSV import lists them all).
function collectTestCaseErrors(body) {
  if (!body || typeof body !== 'object') return { errors: ['Request body must be a JSON object'] };

  const typeError = textTypeError(body, [
    ['title', 'Title'],
    ['preconditions', 'Preconditions'],
    ['expectedResult', 'Expected result'],
    ['severity', 'Severity'],
    ['status', 'Status'],
  ]);
  if (typeError) return { errors: [typeError] };
  if (body.steps !== undefined && (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string'))) {
    return { errors: ['Steps must be a list of text'] };
  }

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const title = text(body.title);
  const preconditions = text(body.preconditions) || null;
  const expectedResult = text(body.expectedResult);
  const steps = Array.isArray(body.steps) ? body.steps.map(text).filter(Boolean) : [];
  const severity = body.severity;
  const status = body.status ?? 'draft';

  const errors = [];
  if (!title) errors.push('Title is required');
  if (title.length > 200) errors.push(`Title must be 200 characters or fewer (it has ${title.length})`);
  if (steps.length === 0) errors.push('At least one step is required');
  if (!expectedResult) errors.push('Expected result is required');
  if (!SEVERITIES.includes(severity)) errors.push(`Severity must be one of: ${SEVERITIES.join(', ')}`);
  if (!TEST_CASE_STATUSES.includes(status)) errors.push(`Status must be one of: ${TEST_CASE_STATUSES.join(', ')}`);

  return { errors, values: { title, preconditions, steps: JSON.stringify(steps), expected_result: expectedResult, severity, status } };
}

// The form's check: { values } or { error } with the first problem.
function validateTestCase(body) {
  const { values, errors } = collectTestCaseErrors(body);
  return errors.length ? { error: errors[0] } : { values };
}

function insertTestCase(values, now) {
  return db
    .prepare(
      `INSERT INTO test_cases (title, preconditions, steps, expected_result, severity, status, created_at, updated_at)
       VALUES (@title, @preconditions, @steps, @expected_result, @severity, @status, @now, @now)`
    )
    .run({ ...values, now }).lastInsertRowid;
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

  const id = insertTestCase(values, new Date().toISOString());
  ok(res, toTestCase(findRow(id)), 201);
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

// --- CSV import ---------------------------------------------------------------

// The uploaded file arrives as the raw request body (any content type), up to 2 MB.
const rawFile = express.raw({ type: () => true, limit: MAX_FILE_BYTES });
function readFileBody(req, res, next) {
  rawFile(req, res, (err) => {
    if (err?.type === 'entity.too.large') {
      return fail(res, 413, 'The file is larger than 2 MB. Split it into smaller files and import them one at a time.');
    }
    if (err) return next(err);
    if (!Buffer.isBuffer(req.body)) return fail(res, 400, 'Send the CSV file as the request body');
    next();
  });
}

// Reads and checks the uploaded file. Returns { analysis } or sends the error reply and returns null.
function analyzeUpload(req, res) {
  const encoding = req.query.encoding;
  if (encoding !== undefined && !CHOOSABLE_ENCODINGS.includes(encoding)) {
    fail(res, 400, `Encoding must be one of: ${CHOOSABLE_ENCODINGS.join(', ')}`);
    return null;
  }
  const existingTitles = new Set(db.prepare('SELECT title FROM test_cases').all().map((r) => r.title.trim().toLowerCase()));
  const analysis = analyzeCsv(req.body, encoding, {
    checkRow: (body) => collectTestCaseErrors(body).errors,
    existingTitles,
  });
  if (analysis.error) {
    fail(res, 422, analysis.error);
    return null;
  }
  return analysis;
}

const forClient = ({ body, ...row }) => row; // the internal "body" isn't part of the reply

// POST /api/test-cases/import/preview?encoding=  (body: the CSV file) -> every row with its problems; saves nothing
function handlePreviewTestCaseImport(req, res) {
  const analysis = analyzeUpload(req, res);
  if (!analysis) return;
  ok(res, { ...analysis, rows: analysis.rows.map(forClient) });
}

// POST /api/test-cases/import?encoding=  (body: the same CSV file) -> imports the valid rows, skips the rest.
// The file is read and checked again here, so only rows that pass the server's rules are saved.
function handleImportTestCases(req, res) {
  const analysis = analyzeUpload(req, res);
  if (!analysis) return;

  const valid = analysis.rows.filter((r) => r.errors.length === 0);
  const now = new Date().toISOString();
  // One transaction: either every valid row is saved, or (if anything fails) none are.
  const ids = db.transaction(() => valid.map((r) => insertTestCase(collectTestCaseErrors(r.body).values, now)))();

  ok(
    res,
    {
      imported: ids.length,
      importedIds: ids,
      skipped: analysis.rows.filter((r) => r.errors.length > 0).map(forClient),
      headers: analysis.headers,
      blankRows: analysis.blankRows,
    },
    201
  );
}

// Only whole-number IDs reach the handlers; anything else, like "1.0" or "abc", is not found.
router.param('id', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Test case not found')));

router.get('/', handleListTestCases);
router.get('/:id', handleGetTestCase);
router.post('/', handleCreateTestCase);
router.post('/import/preview', readFileBody, handlePreviewTestCaseImport);
router.post('/import', readFileBody, handleImportTestCases);
router.put('/:id', handleUpdateTestCase);
router.delete('/:id', handleDeleteTestCase);

export default router;
