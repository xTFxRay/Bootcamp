// Flaky test detection. Plain functions with no database access, used by the API, the run
// recorder (to spot new flakes) and the sample data. See CLAUDE.md "Flaky tests".

export const HISTORY_LIMIT = 20; // only the most recent results count
export const MIN_RESULTS = 4; // fewer than this: "not enough data"

// results: [{ result: 'passed' | 'failed' | 'skipped' | null, ... }] oldest first.
// Returns the decided results (passed/failed only), the most recent HISTORY_LIMIT of them.
export function decidedHistory(results) {
  return results.filter((r) => r.result === 'passed' || r.result === 'failed').slice(-HISTORY_LIMIT);
}

// How a test case behaves across its history:
// - not-enough-data: fewer than MIN_RESULTS passed/failed results
// - stable: always passed            - failing: always failed (broken, not flaky)
// - regressed: passed, then failed from one point on   - recovered: failed, then passed from one point on
// - flaky: passes and fails mixed, flipping at least twice
// score: flips ÷ (results − 1) as 0–100 (how often the result changes from one run to the next).
export function classify(results) {
  const history = decidedHistory(results);
  const passed = history.filter((r) => r.result === 'passed').length;
  const failed = history.length - passed;
  let flips = 0;
  for (let i = 1; i < history.length; i++) if (history[i].result !== history[i - 1].result) flips += 1;
  const score = history.length > 1 ? Math.round((flips / (history.length - 1)) * 100) : 0;
  const last = history[history.length - 1]?.result ?? null;

  let status;
  if (history.length < MIN_RESULTS) status = 'not-enough-data';
  else if (failed === 0) status = 'stable';
  else if (passed === 0) status = 'failing';
  else if (flips >= 2) status = 'flaky';
  else status = last === 'failed' ? 'regressed' : 'recovered';

  return { status, score: status === 'flaky' ? score : 0, flips, passed, failed, total: history.length, last };
}

// The leaderboard order: highest score first, then the most recent failure, then the title.
export function compareFlaky(a, b) {
  return b.score - a.score || (b.lastFailedAt ?? '').localeCompare(a.lastFailedAt ?? '') || a.title.localeCompare(b.title);
}
