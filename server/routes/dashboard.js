import { Router } from 'express';
import db, { TEST_CASE_STATUSES } from '../db.js';
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

  // Totals the page uses to tell "nothing here yet" apart from "all done", and to point at the next step.
  const totalSuites = db.prepare('SELECT COUNT(*) AS n FROM test_suites').get().n;
  const totalRuns = db.prepare('SELECT COUNT(*) AS n FROM test_runs_v2').get().n;
  const totalBugs = Object.values(bugCounts).reduce((sum, n) => sum + n, 0);

  ok(res, {
    metrics: {
      totalTestCases,
      totalSuites,
      totalRuns,
      totalBugs,
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

// --- Trends (the three dashboard charts) ------------------------------------

const TREND_RUNS = 10;
const TREND_WEEKS = 8;
const DAY_MS = 86_400_000;

// Monday 00:00 UTC of the week that contains `date`.
function weekStartUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - daysSinceMonday * DAY_MS);
}

// GET /api/dashboard/trends
// passRateTrend: the last 10 test runs, oldest first, each with its pass rate (passed ÷ (passed + failed)).
// bugsPerWeek:   bugs opened and bugs closed in each of the last 8 weeks (Monday to Sunday, UTC), oldest first.
// coverage:      how many test cases have each status, every status listed even when it's 0.
function handleGetDashboardTrends(req, res) {
  const passRateTrend = db
    .prepare(
      `SELECT id, suite_name, status, start_time, pass_count, fail_count, skip_count
       FROM test_runs_v2 ORDER BY start_time DESC, id DESC LIMIT ?`
    )
    .all(TREND_RUNS)
    .reverse()
    .map((r) => {
      const decided = r.pass_count + r.fail_count;
      return {
        runId: r.id,
        suiteName: r.suite_name,
        status: r.status,
        date: r.start_time,
        passed: r.pass_count,
        failed: r.fail_count,
        skipped: r.skip_count,
        passRate: decided ? Math.round((r.pass_count / decided) * 1000) / 10 : null, // null: nothing passed or failed
      };
    });

  // Opened = the bug was reported. Closed = its status was changed to "closed" (a bug closed,
  // reopened and closed again counts in each week it was closed).
  const thisWeek = weekStartUtc(new Date());
  const firstWeek = new Date(thisWeek.getTime() - (TREND_WEEKS - 1) * 7 * DAY_MS);
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => ({
    weekStart: new Date(firstWeek.getTime() + i * 7 * DAY_MS).toISOString().slice(0, 10),
    opened: 0,
    closed: 0,
  }));
  const bucket = (iso) => Math.floor((Date.parse(iso) - firstWeek.getTime()) / (7 * DAY_MS));
  const since = firstWeek.toISOString();
  for (const { created_at } of db.prepare('SELECT created_at FROM bugs WHERE created_at >= ?').all(since)) {
    const i = bucket(created_at);
    if (i >= 0 && i < TREND_WEEKS) weeks[i].opened += 1;
  }
  const closedRows = db
    .prepare(`SELECT created_at FROM bug_activity WHERE action = 'status_change' AND new_value = 'closed' AND created_at >= ?`)
    .all(since);
  for (const { created_at } of closedRows) {
    const i = bucket(created_at);
    if (i >= 0 && i < TREND_WEEKS) weeks[i].closed += 1;
  }

  const counts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM test_cases GROUP BY status').all().map((r) => [r.status, r.n])
  );
  const coverage = TEST_CASE_STATUSES.map((status) => ({ status, count: counts[status] ?? 0 }));

  ok(res, {
    passRateTrend,
    bugsPerWeek: weeks,
    coverage,
    generatedAt: new Date().toISOString(),
  });
}

router.get('/metrics', handleGetDashboardMetrics);
router.get('/trends', handleGetDashboardTrends);

export default router;
