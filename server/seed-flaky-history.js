import { classify } from './flakiness.js';

// Sample run history for the Flaky tests page: 12 nightly runs of a "Nightly regression" suite over
// the last 3 weeks, with a few tests that pass and fail on and off. Each failure has notes like a
// tester would write, so the flake-analyzer agent has real evidence to reason from.
// Runs once per database (see db.js). Takes the database as an argument, like report-snapshot.js.

const P = 'passed';
const F = 'failed';
const RUNS = 12;

// Test cases in the suite. Existing ones are found by title; missing ones are created.
// pattern: one result per run, oldest first. failNote / seconds: what a failure looks like.
const CASES = [
  {
    title: 'Browser tab shows the app name',
    pattern: Array(RUNS).fill(P),
    seconds: [20, 30],
  },
  {
    title: 'Sign-in shows an error for a wrong password',
    pattern: Array(RUNS).fill(F),
    failNote: 'http://localhost:5173/login shows "Page not found". There is no login page yet, so the error message can\'t appear.',
    seconds: [25, 40],
  },
  {
    // Fails only in runs where "Reporting a bug adds it to the bug list" ran right before it.
    title: 'Bug list can be filtered by status',
    steps: ['Open the Bugs page', 'Choose "resolved" in the status filter'],
    expected: 'Only bugs with status resolved are listed',
    preconditions: 'At least one bug is resolved',
    severity: 'Major',
    orderDependent: true,
    failNote:
      'With the filter on "resolved", the list also showed the bug created by the previous test case (status open). After reloading the page the list was correct.',
    seconds: [35, 50],
  },
  {
    title: 'Reporting a bug adds it to the bug list',
    steps: ['Open the Bugs page', 'Click "+ Report bug"', 'Fill in every required field', 'Click "Report bug"'],
    expected: 'The new bug opens on its own page and is listed first on the Bugs page with status open',
    severity: 'Major',
    pattern: Array(RUNS).fill(P),
    seconds: [70, 95],
  },
  {
    title: 'Dashboard shows the number of open bugs',
    steps: ['Open the Dashboard', 'Read the "Open bugs" card', 'Open the Bugs page with the status filter set to open'],
    expected: 'The "Open bugs" card shows the same number as the Bugs page with status open',
    severity: 'Minor',
    pattern: [P, F, P, F, P, P, F, P, F, P, P, F],
    failNote: 'The "Open bugs" card showed 2, but the Bugs page filtered to open showed 3. After refreshing the dashboard the card showed 3.',
    seconds: [30, 45],
  },
  {
    title: 'Password reset email is sent to a registered address',
    pattern: [P, P, F, P, P, F, P, P, P, F, P, P],
    failNote: 'No reset email arrived within 2 minutes. It arrived about 4 minutes after clicking "Send reset link".',
    seconds: [60, 100],
    failSeconds: [150, 190],
  },
  {
    title: 'Quick search opens the highlighted result with Enter',
    steps: ['Press ⌘K', 'Type "password"', 'Press Enter'],
    expected: 'The test case "Password reset email is sent to a registered address" opens in its edit dialog',
    severity: 'Minor',
    pattern: [P, P, P, F, P, P, F, P, P, P, F, P],
    failNote:
      'Pressed Enter right after typing. The results from the previous search were still showing, so a different test case opened. Waiting a second before Enter opened the right one.',
    seconds: [15, 25],
  },
  {
    title: 'Test case search finds a title by partial text',
    pattern: Array(RUNS).fill(P),
    seconds: [40, 60],
  },
  {
    // Passed every night until the last one: it becomes flaky the next time it passes again.
    title: 'Report can be downloaded as an HTML file',
    steps: ['Open Reports', 'Open the first report', 'Click "Download HTML"'],
    expected: 'A file named test-report-<number>-....html is downloaded',
    preconditions: 'At least one report exists',
    severity: 'Minor',
    pattern: [...Array(RUNS - 1).fill(P), F],
    failNote: 'Clicking "Download HTML" did nothing the first time; the file only downloaded on the second click.',
    seconds: [25, 35],
  },
];

// Runs where the order-dependent test fails (its "create a bug" neighbour ran right before it).
const ORDER_FAIL_RUNS = new Set([2, 5, 8, 10]);

export function seedFlakyHistory(db) {
  const findCase = db.prepare('SELECT * FROM test_cases WHERE title = ? ORDER BY id LIMIT 1');
  const now = new Date().toISOString();
  const insertCase = db.prepare(
    `INSERT INTO test_cases (title, preconditions, steps, expected_result, severity, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`
  );

  // Every case needs a real test case; one we can't find or create is left out.
  const cases = CASES.map((c) => {
    let row = findCase.get(c.title);
    if (!row && c.steps) {
      const { lastInsertRowid } = insertCase.run(c.title, c.preconditions ?? null, JSON.stringify(c.steps), c.expected, c.severity, now, now);
      row = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(lastInsertRowid);
    }
    return row ? { ...c, row } : null;
  }).filter(Boolean);
  if (cases.length < 4) return;

  const insertSuite = db.prepare("INSERT INTO test_suites (name, feature, status, created_at, updated_at) VALUES (?, ?, 'ready', ?, ?)");
  const linkCase = db.prepare('INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES (?, ?, ?)');
  const insertRun = db.prepare(
    `INSERT INTO test_runs_v2 (suite_id, suite_name, status, pass_count, fail_count, skip_count, start_time, end_time, created_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'Sample data')`
  );
  const insertResult = db.prepare(
    `INSERT INTO test_run_results (run_id, test_case_id, sort_order, title, preconditions, steps, expected_result, severity,
       result, duration_ms, notes, recorded_at, failed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // A small, repeatable "random" so every database gets the same sample timings.
  let seed = 7;
  const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const between = ([lo, hi]) => Math.round(lo + random() * (hi - lo));

  const DAY = 86_400_000;
  // The last nightly run starts 2 days ago at 02:00 UTC, so runs people record by hand come after it.
  const lastStart = new Date(Date.now() - 2 * DAY);
  lastStart.setUTCHours(2, 0, 0, 0);

  db.transaction(() => {
    const created = new Date(lastStart.getTime() - RUNS * 1.75 * DAY - DAY).toISOString();
    const { lastInsertRowid: suiteId } = insertSuite.run('Nightly regression', 'core flows', created, created);
    cases.forEach((c, i) => linkCase.run(suiteId, c.row.id, i + 1));

    for (let run = 0; run < RUNS; run++) {
      const start = lastStart.getTime() - Math.round((RUNS - 1 - run) * 1.75 * DAY);
      // Order: the "create a bug" case runs right before the filter case only in ORDER_FAIL_RUNS.
      const order = [...cases];
      const filterIdx = order.findIndex((c) => c.orderDependent);
      const creatorIdx = order.findIndex((c) => c.title === 'Reporting a bug adds it to the bug list');
      if (filterIdx >= 0 && creatorIdx >= 0) {
        const [creator] = order.splice(creatorIdx, 1);
        const at = order.findIndex((c) => c.orderDependent);
        order.splice(ORDER_FAIL_RUNS.has(run) ? at : at + 1, 0, creator);
      }

      let clock = start;
      const results = order.map((c, position) => {
        const result = c.orderDependent ? (ORDER_FAIL_RUNS.has(run) ? F : P) : c.pattern[run];
        const seconds = between(result === F && c.failSeconds ? c.failSeconds : c.seconds);
        clock += seconds * 1000;
        const at = new Date(clock).toISOString();
        return { c, position, result, seconds, at };
      });
      const failed = results.filter((r) => r.result === F).length;
      const { lastInsertRowid: runId } = insertRun.run(
        suiteId,
        'Nightly regression',
        failed ? 'failed' : 'passed',
        results.length - failed,
        failed,
        new Date(start).toISOString(),
        results[results.length - 1].at
      );
      for (const r of results) {
        const t = r.c.row;
        insertResult.run(runId, t.id, r.position + 1, t.title, t.preconditions, t.steps, t.expected_result, t.severity,
          r.result, r.seconds * 1000, r.result === F ? r.c.failNote : null, r.at, r.result === F ? r.at : null);
      }
    }

    // Tests that are already flaky in the sample data are flagged as known, without a Discord alert,
    // so only flakes that appear from now on send one.
    const history = db.prepare(
      `SELECT r.result, r.recorded_at FROM test_run_results r JOIN test_runs_v2 x ON x.id = r.run_id
       WHERE r.test_case_id = ? ORDER BY x.start_time, r.sort_order`
    );
    const flag = db.prepare(
      "INSERT OR IGNORE INTO flaky_flags (test_case_id, flagged_at, alert_error) VALUES (?, ?, 'Sample data: no alert sent')"
    );
    for (const c of cases) {
      const rows = history.all(c.row.id);
      // flagged_at: when the history first became flaky.
      for (let n = 1; n <= rows.length; n++) {
        if (classify(rows.slice(0, n)).status === 'flaky') {
          flag.run(c.row.id, rows[n - 1].recorded_at);
          break;
        }
      }
    }
  })();
  console.log(`Added the "Nightly regression" suite with ${RUNS} sample runs of ${cases.length} test cases.`);
}
