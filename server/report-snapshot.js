// Builds a test report: a frozen copy of a test run's results at the moment it's generated.
// Used by POST /api/reports and by the sample data in db.js. Takes the database as an
// argument (rather than importing db.js) so db.js can use it while it's still starting up.

// Inserts a report for the run and returns its new id, or null if the run doesn't exist.
export function createReportFromRun(db, runId, generatedAt = new Date().toISOString()) {
  const run = db.prepare('SELECT * FROM test_runs_v2 WHERE id = ?').get(runId);
  if (!run) return null;

  const rows = db
    .prepare('SELECT * FROM test_run_results WHERE run_id = ? ORDER BY sort_order')
    .all(runId);

  // Per-case outcomes. "not run" is kept so an in-progress run's report says what's missing.
  const results = rows.map((r) => ({
    position: r.sort_order,
    testCaseId: r.test_case_id,
    title: r.title,
    severity: r.severity,
    result: r.result ?? 'not run',
    durationMs: r.duration_ms,
    notes: r.notes,
    recordedAt: r.recorded_at,
  }));
  const count = (result) => results.filter((r) => r.result === result).length;

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO reports (run_id, suite_name, run_date, run_status, total_count, passed_count, failed_count,
                            skipped_count, results, generated_at)
       VALUES (@runId, @suiteName, @runDate, @runStatus, @total, @passed, @failed, @skipped, @results, @generatedAt)`
    )
    .run({
      runId: run.id,
      suiteName: run.suite_name,
      runDate: run.start_time,
      runStatus: run.status,
      total: results.length,
      passed: count('passed'),
      failed: count('failed'),
      skipped: count('skipped'),
      results: JSON.stringify(results),
      generatedAt,
    });
  return lastInsertRowid;
}
