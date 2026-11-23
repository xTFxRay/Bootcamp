import db from './db.js';
import { classify, compareFlaky, decidedHistory, HISTORY_LIMIT } from './flakiness.js';
import { sendFlakeAlert } from './discord.js';
import { AI_WRITTEN_BY, isAiEnabled, writeHypothesisWithAi } from './flake-hypothesis-ai.js';

// Reads test case histories from the database and keeps the flaky flags up to date.
// Used by the /api/flaky endpoints and by the run recorder (test-runs.js).

const NEW_FLAKE_DAYS = 7;

// AI hypotheses being written right now, and the last failure per test case (kept in memory: they're
// only shown on the page, and a restart simply clears them).
const aiWriting = new Set();
const aiErrors = new Map();

// Every recorded result of one test case, oldest first, with the run it belongs to.
const historyQuery = db.prepare(
  `SELECT r.id AS result_id, r.result, r.notes, r.duration_ms, r.recorded_at, r.sort_order,
          x.id AS run_id, x.suite_name, x.start_time
   FROM test_run_results r JOIN test_runs_v2 x ON x.id = r.run_id
   WHERE r.test_case_id = ? AND r.result IS NOT NULL
   ORDER BY x.start_time, x.id, r.sort_order`
);

function toHistoryItem(r) {
  return { result: r.result, runId: r.run_id, suiteName: r.suite_name, at: r.recorded_at ?? r.start_time, durationMs: r.duration_ms, notes: r.notes };
}

// One test case's summary: classification, score, the last HISTORY_LIMIT passed/failed results,
// its flag and its hypothesis.
function summarize(testCase, rows, flag, hypothesis) {
  const k = classify(rows);
  const history = decidedHistory(rows).map(toHistoryItem);
  const lastFailed = [...history].reverse().find((h) => h.result === 'failed');
  const active = flag && !flag.cleared_at ? flag : null;
  return {
    testCaseId: testCase.id,
    title: testCase.title,
    severity: testCase.severity,
    status: k.status,
    score: k.score,
    flips: k.flips,
    passed: k.passed,
    failed: k.failed,
    total: k.total,
    skipped: rows.filter((r) => r.result === 'skipped').length,
    history,
    lastFailedAt: lastFailed?.at ?? null,
    lastFailureNotes: lastFailed?.notes ?? null,
    flaggedAt: active?.flagged_at ?? null,
    isNew: Boolean(active && Date.now() - Date.parse(active.flagged_at) < NEW_FLAKE_DAYS * 86_400_000),
    alertSentAt: active?.alert_sent_at ?? null,
    ai: { writing: aiWriting.has(testCase.id), error: aiErrors.get(testCase.id) ?? null },
    hypothesis: hypothesis
      ? {
          text: hypothesis.hypothesis,
          evidence: hypothesis.evidence,
          confidence: hypothesis.confidence,
          writtenBy: hypothesis.written_by,
          writtenAt: hypothesis.written_at,
          basedOnResults: hypothesis.based_on_results,
          // Written before the newest results: the explanation may no longer fit.
          outdated: hypothesis.based_on_results < k.total,
        }
      : null,
  };
}

// Every test case that has at least one recorded result.
export function allTestSummaries() {
  const cases = db.prepare('SELECT id, title, severity FROM test_cases ORDER BY title').all();
  const flags = new Map(db.prepare('SELECT * FROM flaky_flags').all().map((f) => [f.test_case_id, f]));
  const hyps = new Map(db.prepare('SELECT * FROM flake_hypotheses').all().map((h) => [h.test_case_id, h]));
  return cases
    .map((c) => ({ c, rows: historyQuery.all(c.id) }))
    .filter(({ rows }) => rows.length > 0)
    .map(({ c, rows }) => summarize(c, rows, flags.get(c.id), hyps.get(c.id)));
}

export function leaderboard(limit = 10) {
  const all = allTestSummaries();
  const flaky = all.filter((t) => t.status === 'flaky').sort(compareFlaky);
  const count = (status) => all.filter((t) => t.status === status).length;
  return {
    summary: {
      tracked: all.length,
      flaky: flaky.length,
      newThisWeek: flaky.filter((t) => t.isNew).length,
      failing: count('failing'),
      regressed: count('regressed'),
      stable: count('stable'),
      notEnoughData: count('not-enough-data'),
      historyLimit: HISTORY_LIMIT,
      aiEnabled: isAiEnabled(),
    },
    top: flaky.slice(0, limit).map((t, i) => ({ rank: i + 1, ...t })),
  };
}

// Everything the flake-analyzer agent needs about one test case.
export function evidenceFor(testCaseId) {
  const testCase = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(testCaseId);
  if (!testCase) return null;
  const rows = historyQuery.all(testCaseId);
  const before = db.prepare(
    `SELECT title, result FROM test_run_results WHERE run_id = ? AND sort_order = ? - 1`
  );
  const flag = db.prepare('SELECT * FROM flaky_flags WHERE test_case_id = ?').get(testCaseId);
  const hyp = db.prepare('SELECT * FROM flake_hypotheses WHERE test_case_id = ?').get(testCaseId);
  return {
    ...summarize(testCase, rows, flag, hyp),
    preconditions: testCase.preconditions,
    steps: JSON.parse(testCase.steps),
    expectedResult: testCase.expected_result,
    // Every result, including skipped ones, with what ran just before it in the same run.
    results: rows.slice(-HISTORY_LIMIT * 2).map((r) => {
      const prev = before.get(r.run_id, r.sort_order);
      return {
        ...toHistoryItem(r),
        positionInRun: r.sort_order,
        ranAfter: prev ? { title: prev.title, result: prev.result } : null,
      };
    }),
  };
}

// Saves (or replaces) a test case's hypothesis. based_on_results remembers how many results it was
// written from, so the page can say when it's out of date.
export function saveHypothesis(testCaseId, { hypothesis, evidence, confidence, writtenBy }) {
  const total = classify(historyQuery.all(testCaseId)).total;
  db.prepare(
    `INSERT INTO flake_hypotheses (test_case_id, hypothesis, evidence, confidence, based_on_results, written_by, written_at)
     VALUES (@testCaseId, @hypothesis, @evidence, @confidence, @total, @writtenBy, @now)
     ON CONFLICT (test_case_id) DO UPDATE SET hypothesis = excluded.hypothesis, evidence = excluded.evidence,
       confidence = excluded.confidence, based_on_results = excluded.based_on_results,
       written_by = excluded.written_by, written_at = excluded.written_at`
  ).run({ testCaseId, hypothesis, evidence: evidence ?? null, confidence, total, writtenBy, now: new Date().toISOString() });
  aiErrors.delete(testCaseId);
}

// Has the Claude API write a hypothesis for one test case and saves it. Throws with a plain message
// if it can't (AI off, already being written, API error). One request per test case at a time.
export async function writeHypothesisNow(testCaseId) {
  // QA-06: a test case that doesn't exist is "not found", whether or not AI is on.
  const evidence = evidenceFor(testCaseId);
  if (!evidence) throw Object.assign(new Error('Test case not found'), { status: 404 });
  if (!isAiEnabled()) throw Object.assign(new Error('AI hypotheses are off: add ANTHROPIC_API_KEY to .env (and to Render).'), { status: 503 });
  if (aiWriting.has(testCaseId)) throw Object.assign(new Error('A hypothesis for this test is already being written.'), { status: 409 });
  aiWriting.add(testCaseId);
  try {
    const result = await writeHypothesisWithAi(evidence);
    saveHypothesis(testCaseId, { ...result, writtenBy: AI_WRITTEN_BY });
    return evidenceFor(testCaseId).hypothesis;
  } catch (err) {
    aiErrors.set(testCaseId, err.message);
    throw Object.assign(err, { status: err.status ?? 502 });
  } finally {
    aiWriting.delete(testCaseId);
  }
}

// After a result is recorded: flag the test case if it just turned flaky (and send the Discord
// alert once), or clear its flag if it's no longer flaky. Never throws.
// Returns null, or { title, score, alert: { ok, error } } for a new flake.
export async function checkForNewFlake(testCaseId, { runId, suiteName }) {
  if (!testCaseId) return null;
  try {
    const rows = historyQuery.all(testCaseId);
    const k = classify(rows);
    const flag = db.prepare('SELECT * FROM flaky_flags WHERE test_case_id = ?').get(testCaseId);
    const now = new Date().toISOString();

    if (k.status !== 'flaky') {
      // Back to stable (or broken for good): clear the flag, so a future flake alerts again.
      if (flag && !flag.cleared_at && (k.status === 'stable' || k.status === 'failing' || k.status === 'recovered')) {
        db.prepare('UPDATE flaky_flags SET cleared_at = ? WHERE test_case_id = ?').run(now, testCaseId);
      }
      return null;
    }
    if (flag && !flag.cleared_at) return null; // already known

    db.prepare(
      `INSERT INTO flaky_flags (test_case_id, flagged_at) VALUES (?, ?)
       ON CONFLICT (test_case_id) DO UPDATE SET flagged_at = excluded.flagged_at, cleared_at = NULL, alert_sent_at = NULL, alert_error = NULL`
    ).run(testCaseId, now);
    const testCase = db.prepare('SELECT title FROM test_cases WHERE id = ?').get(testCaseId);
    const alert = await sendFlakeAlert({
      title: testCase.title,
      score: k.score,
      history: decidedHistory(rows).map((r) => r.result),
      runId,
      suiteName,
    });
    db.prepare('UPDATE flaky_flags SET alert_sent_at = ?, alert_error = ? WHERE test_case_id = ?').run(
      alert.ok ? new Date().toISOString() : null,
      alert.ok ? null : alert.error,
      testCaseId
    );
    // Write the root-cause hypothesis in the background: the result is already saved, and a slow or
    // failed API call must not hold up the person recording results.
    const aiStarted = isAiEnabled();
    if (aiStarted) {
      writeHypothesisNow(testCaseId)
        .then(() => console.log(`AI hypothesis written for new flaky test #${testCaseId}.`))
        .catch((err) => console.warn(`AI hypothesis for new flaky test #${testCaseId} failed: ${err.message}`));
    }
    return { title: testCase.title, score: k.score, alert, aiHypothesis: aiStarted ? 'writing' : 'off' };
  } catch (err) {
    console.error('Flaky check failed:', err);
    return null;
  }
}

// Rechecks every test case: flags new flakes and sends their alert (once, through checkForNewFlake),
// clears flags of tests that settled, and retries alerts that failed to send earlier. Safe to run any
// number of times. Used by the PostToolUse hook (qa-plugin) after Claude records a run result.
export async function recomputeFlakes() {
  const cases = db.prepare('SELECT id FROM test_cases').all();
  const newFlakes = [];
  for (const { id } of cases) {
    const rows = historyQuery.all(id);
    if (!rows.length) continue;
    const last = rows[rows.length - 1];
    const found = await checkForNewFlake(id, { runId: last.run_id, suiteName: last.suite_name });
    if (found) newFlakes.push({ testCaseId: id, ...found });
  }

  // Alerts that failed earlier (e.g. Discord was unreachable) get another try. Sample data is never alerted.
  const retried = [];
  const unsent = db
    .prepare(
      `SELECT f.test_case_id, c.title FROM flaky_flags f JOIN test_cases c ON c.id = f.test_case_id
       WHERE f.cleared_at IS NULL AND f.alert_sent_at IS NULL AND (f.alert_error IS NULL OR f.alert_error NOT LIKE 'Sample data%')`
    )
    .all();
  for (const u of unsent) {
    if (newFlakes.some((n) => n.testCaseId === u.test_case_id)) continue;
    const rows = historyQuery.all(u.test_case_id);
    const k = classify(rows);
    if (k.status !== 'flaky') continue;
    const last = rows[rows.length - 1];
    const alert = await sendFlakeAlert({
      title: u.title, score: k.score, history: decidedHistory(rows).map((r) => r.result), runId: last.run_id, suiteName: last.suite_name,
    });
    db.prepare('UPDATE flaky_flags SET alert_sent_at = ?, alert_error = ? WHERE test_case_id = ?').run(
      alert.ok ? new Date().toISOString() : null, alert.ok ? null : alert.error, u.test_case_id
    );
    retried.push({ testCaseId: u.test_case_id, title: u.title, alert });
  }

  const board = leaderboard(10);
  return { summary: board.summary, top: board.top.map((t) => ({ rank: t.rank, title: t.title, score: t.score })), newFlakes, retried };
}
