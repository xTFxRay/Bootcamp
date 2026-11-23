import { Router } from 'express';
import db, { TEST_RUN_RESULTS, TEST_RUN_STATUSES } from './db.js';
import { ok, fail } from './api-response.js';
import { textTypeError, toId } from './validation.js';
import { sendTestFailureAlert } from './discord.js';
import { checkForNewFlake } from './flaky-tracker.js';

// Test run endpoints, mounted at /api/test-runs.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const PAGE_SIZE = 20;
const LIMITS = { notes: 2000, createdBy: 80 };

// Database rows -> API shape.
function toRun(row) {
  return {
    id: row.id,
    suiteId: row.suite_id,
    suiteName: row.suite_name,
    status: row.status,
    passCount: row.pass_count,
    failCount: row.fail_count,
    skipCount: row.skip_count,
    caseCount: row.case_count,
    startTime: row.start_time,
    endTime: row.end_time,
    createdBy: row.created_by,
  };
}

function toResult(row) {
  return {
    id: row.id,
    testCaseId: row.test_case_id,
    position: row.sort_order,
    title: row.title,
    preconditions: row.preconditions,
    steps: JSON.parse(row.steps),
    expectedResult: row.expected_result,
    severity: row.severity,
    result: row.result,
    durationMs: row.duration_ms,
    notes: row.notes,
    recordedAt: row.recorded_at,
    failedAt: row.failed_at,
    alertSentAt: row.alert_sent_at,
    alertError: row.alert_error,
  };
}

const RUN_SELECT = `
  SELECT r.*, (SELECT COUNT(*) FROM test_run_results x WHERE x.run_id = r.id) AS case_count
  FROM test_runs_v2 r`;

function findRun(id) {
  return db.prepare(`${RUN_SELECT} WHERE r.id = ?`).get(id);
}

function runWithResults(id) {
  const results = db
    .prepare('SELECT * FROM test_run_results WHERE run_id = ? ORDER BY sort_order')
    .all(id)
    .map(toResult);
  return { ...toRun(findRun(id)), results };
}

// Recounts a run's results and sets its status and end time from them.
function updateRunTotals(runId, now) {
  const c = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(result = 'passed') AS passed, SUM(result = 'failed') AS failed,
              SUM(result = 'skipped') AS skipped, SUM(result IS NULL) AS pending
       FROM test_run_results WHERE run_id = ?`
    )
    .get(runId);
  const done = c.pending === 0;
  const status = !done ? 'in-progress' : c.failed > 0 ? 'failed' : 'passed';
  db.prepare(
    `UPDATE test_runs_v2
     SET pass_count = ?, fail_count = ?, skip_count = ?, status = ?,
         end_time = CASE WHEN ? THEN COALESCE(end_time, ?) ELSE NULL END
     WHERE id = ?`
  ).run(c.passed ?? 0, c.failed ?? 0, c.skipped ?? 0, status, done ? 1 : 0, now, runId);
}

// GET /api/test-runs?status=&suiteId=&page=
function handleListTestRuns(req, res) {
  const { status, suiteId, page: pageParam } = req.query;
  for (const [key, value] of Object.entries({ status, suiteId, page: pageParam })) {
    if (value !== undefined && typeof value !== 'string') return fail(res, 400, `Only one "${key}" value is allowed`);
  }
  if (status && !TEST_RUN_STATUSES.includes(status)) {
    return fail(res, 400, `Status must be one of: ${TEST_RUN_STATUSES.join(', ')}`);
  }
  if (suiteId !== undefined && !toId(suiteId)) return fail(res, 400, 'suiteId must be a suite ID number');
  const page = pageParam === undefined ? 1 : toId(pageParam);
  if (!page) return fail(res, 400, 'Page must be a whole number, 1 or more');

  const where = [];
  const params = {};
  if (status) (where.push('r.status = @status'), (params.status = status));
  if (suiteId) (where.push('r.suite_id = @suiteId'), (params.suiteId = toId(suiteId)));
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM test_runs_v2 r ${whereSql}`).get(params);
  const rows = db
    .prepare(`${RUN_SELECT} ${whereSql} ORDER BY r.start_time DESC, r.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  ok(res, { items: rows.map(toRun), page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
}

// GET /api/test-runs/:id (with every case's result)
function handleGetTestRun(req, res) {
  if (!findRun(req.params.id)) return fail(res, 404, 'Test run not found');
  ok(res, runWithResults(req.params.id));
}

// POST /api/test-runs  { suiteId, createdBy? }
// Starts a run of the suite, copying its current test cases into the run.
function handleCreateTestRun(req, res) {
  const body = req.body ?? {};
  const typeError = textTypeError(body, [['createdBy', 'Run by']]);
  if (typeError) return fail(res, 400, typeError);
  const suiteId = toId(body.suiteId);
  if (!suiteId) return fail(res, 400, 'suiteId must be a suite ID number');
  const createdBy = (body.createdBy ?? '').trim() || 'Unknown';
  if (createdBy.length > LIMITS.createdBy) {
    return fail(res, 400, `"Run by" must be ${LIMITS.createdBy} characters or fewer`);
  }

  const suite = db.prepare('SELECT id, name FROM test_suites WHERE id = ?').get(suiteId);
  if (!suite) return fail(res, 404, 'Test suite not found');
  const cases = db
    .prepare(
      `SELECT c.* FROM test_suite_cases l JOIN test_cases c ON c.id = l.test_case_id
       WHERE l.suite_id = ? ORDER BY l.sort_order`
    )
    .all(suiteId);
  if (cases.length === 0) return fail(res, 400, 'This suite has no test cases to run. Add some first.');

  const now = new Date().toISOString();
  const runId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO test_runs_v2 (suite_id, suite_name, status, start_time, created_by)
         VALUES (?, ?, 'in-progress', ?, ?)`
      )
      .run(suite.id, suite.name, now, createdBy);
    const insert = db.prepare(
      `INSERT INTO test_run_results (run_id, test_case_id, sort_order, title, preconditions, steps, expected_result, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    cases.forEach((c, i) =>
      insert.run(lastInsertRowid, c.id, i + 1, c.title, c.preconditions, c.steps, c.expected_result, c.severity)
    );
    return lastInsertRowid;
  })();
  ok(res, runWithResults(runId), 201);
}

// PATCH /api/test-runs/:id/results/:resultId  { result, notes? }
// Records a case's result. Marking it failed needs notes, and posts a Discord alert.
async function handleRecordTestResult(req, res) {
  const run = findRun(req.params.id);
  if (!run) return fail(res, 404, 'Test run not found');
  const row = db
    .prepare('SELECT * FROM test_run_results WHERE id = ? AND run_id = ?')
    .get(req.params.resultId, run.id);
  if (!row) return fail(res, 404, "This test case isn't part of the run");

  const body = req.body ?? {};
  const typeError = textTypeError(body, [
    ['result', 'Result'],
    ['notes', 'Notes'],
  ]);
  if (typeError) return fail(res, 400, typeError);
  const { result } = body;
  if (!result) return fail(res, 400, 'Result is required');
  if (!TEST_RUN_RESULTS.includes(result)) return fail(res, 400, `Result must be one of: ${TEST_RUN_RESULTS.join(', ')}`);
  const notes = (body.notes ?? '').trim() || null;
  if (notes && notes.length > LIMITS.notes) return fail(res, 400, `Notes must be ${LIMITS.notes} characters or fewer`);
  if (result === 'failed' && !notes) return fail(res, 400, 'Write what went wrong in the notes before marking it failed');

  const now = new Date().toISOString();
  db.transaction(() => {
    // Duration: time since the previous result in this run (or since the run started). Kept from the first time.
    let durationMs = row.duration_ms;
    if (durationMs === null) {
      const { last } = db
        .prepare('SELECT MAX(recorded_at) AS last FROM test_run_results WHERE run_id = ? AND id != ?')
        .get(run.id, row.id);
      const since = Date.parse(last && last > run.start_time ? last : run.start_time);
      durationMs = Math.max(0, Date.now() - since);
    }
    const stillFailed = result === 'failed' && row.result === 'failed';
    db.prepare(
      `UPDATE test_run_results
       SET result = @result, notes = @notes, duration_ms = @durationMs, recorded_at = COALESCE(recorded_at, @now),
           failed_at = @failedAt, alert_sent_at = @alertSentAt, alert_error = @alertError
       WHERE id = @id`
    ).run({
      result,
      notes,
      durationMs,
      now,
      id: row.id,
      failedAt: result === 'failed' ? (stillFailed ? row.failed_at : now) : null,
      // A new failure gets a new alert; editing the notes of a failure that was already alerted doesn't.
      alertSentAt: stillFailed ? row.alert_sent_at : null,
      alertError: stillFailed ? row.alert_error : null,
    });
    updateRunTotals(run.id, now);
  })();

  // Alert after saving, so a slow or failed alert never loses the result.
  const needsAlert = result === 'failed' && !(row.result === 'failed' && row.alert_sent_at);
  if (needsAlert) {
    const alert = await sendTestFailureAlert({ runId: run.id, suiteName: run.suite_name, title: row.title, notes });
    db.prepare('UPDATE test_run_results SET alert_sent_at = ?, alert_error = ? WHERE id = ?').run(
      alert.ok ? new Date().toISOString() : null,
      alert.ok ? null : alert.error,
      row.id
    );
  }

  // Did this result make the test case flaky? If so it's flagged and a Discord alert goes out (once).
  const newFlake = await checkForNewFlake(row.test_case_id, { runId: run.id, suiteName: run.suite_name });

  ok(res, { ...runWithResults(run.id), newFlake });
}

// DELETE /api/test-runs/:id (removes the run and its results; the suite and test cases stay)
function handleDeleteTestRun(req, res) {
  const run = findRun(req.params.id);
  if (!run) return fail(res, 404, 'Test run not found');
  db.prepare('DELETE FROM test_runs_v2 WHERE id = ?').run(run.id);
  ok(res, toRun(run));
}

// Only whole-number IDs reach the handlers; anything else, like "1.0" or "abc", is not found.
router.param('id', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Test run not found')));
router.param('resultId', (req, res, next, id) =>
  toId(id) ? next() : fail(res, 404, "This test case isn't part of the run")
);

router.get('/', handleListTestRuns);
router.get('/:id', handleGetTestRun);
router.post('/', handleCreateTestRun);
router.patch('/:id/results/:resultId', handleRecordTestResult);
router.delete('/:id', handleDeleteTestRun);

export default router;
