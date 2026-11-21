import { Router } from 'express';
import db from '../db.js';
import { ok } from '../api-response.js';

// Dashboard endpoint, mounted at /api/dashboard.
// Every reply uses { success, data, error } (see CLAUDE.md).
const router = Router();

const RECENT_LIMIT = 10;
const OPEN_BUG_STATUSES = ['open', 'in-progress', 'reopened']; // not yet resolved or closed

// GET /api/dashboard/metrics
// The four headline numbers, the 10 most recent test runs and the 10 most recent bug activity items.
function handleGetDashboardMetrics(req, res) {
  const totalTestCases = db.prepare('SELECT COUNT(*) AS n FROM test_cases').get().n;

  // Pass rate: of every case result recorded in a test run, how many passed.
  // Skipped and not-yet-run cases don't count either way.
  const results = db
    .prepare(
      `SELECT SUM(result = 'passed') AS passed, SUM(result = 'failed') AS failed, SUM(result = 'skipped') AS skipped
       FROM test_run_results`
    )
    .get();
  const passed = results.passed ?? 0;
  const failed = results.failed ?? 0;
  const passRate = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 1000) / 10 : null;

  const bugCounts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM bugs GROUP BY status').all().map((r) => [r.status, r.n])
  );
  const openBugs = OPEN_BUG_STATUSES.reduce((sum, s) => sum + (bugCounts[s] ?? 0), 0);

  // Average duration of finished runs (start to finish).
  const durations = db
    .prepare(
      `SELECT AVG((julianday(end_time) - julianday(start_time)) * 86400000) AS avgMs, COUNT(*) AS n
       FROM test_runs_v2 WHERE end_time IS NOT NULL`
    )
    .get();

  const recentRuns = db
    .prepare(
      `SELECT r.id, r.suite_name, r.status, r.pass_count, r.fail_count, r.skip_count, r.start_time, r.end_time,
              (SELECT COUNT(*) FROM test_run_results x WHERE x.run_id = r.id) AS case_count
       FROM test_runs_v2 r
       ORDER BY r.start_time DESC, r.id DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT)
    .map((r) => ({
      id: r.id,
      suiteName: r.suite_name,
      status: r.status,
      passCount: r.pass_count,
      failCount: r.fail_count,
      skipCount: r.skip_count,
      caseCount: r.case_count,
      startTime: r.start_time,
      endTime: r.end_time,
    }));

  const recentActivity = db
    .prepare(
      `SELECT a.id, a.bug_id, a.action, a.old_value, a.new_value, a.message, a.created_at, b.title
       FROM bug_activity a JOIN bugs b ON b.id = a.bug_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(RECENT_LIMIT)
    .map((a) => ({
      id: a.id,
      bugId: a.bug_id,
      bugTitle: a.title,
      action: a.action,
      oldValue: a.old_value,
      newValue: a.new_value,
      message: a.message,
      timestamp: a.created_at,
    }));

  ok(res, {
    metrics: {
      totalTestCases,
      passRate, // percent with one decimal, or null when nothing has passed or failed yet
      passRateBasis: { passed, failed, skipped: results.skipped ?? 0 },
      openBugs,
      openBugsByStatus: Object.fromEntries(OPEN_BUG_STATUSES.map((s) => [s, bugCounts[s] ?? 0])),
      averageRunDurationMs: durations.n > 0 ? Math.round(durations.avgMs) : null,
      finishedRuns: durations.n,
    },
    recentRuns,
    recentActivity,
    generatedAt: new Date().toISOString(),
  });
}

router.get('/metrics', handleGetDashboardMetrics);

export default router;
