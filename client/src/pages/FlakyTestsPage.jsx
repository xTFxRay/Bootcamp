import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { flakyApi } from '../api.js';
import { formatDate, formatRelative } from '../format.js';
import SeverityBadge from '../components/SeverityBadge.jsx';
import Modal from '../components/Modal.jsx';

// Flaky tests: pass/fail history of every test case across all runs, the 10 flakiest with a
// root-cause hypothesis written by the flake-analyzer agent, and every other test's state.

const STATUS_LABELS = {
  flaky: 'Flaky',
  failing: 'Always failing',
  regressed: 'Started failing',
  recovered: 'Fixed',
  stable: 'Stable',
  'not-enough-data': 'Not enough results',
};
const STATUS_HINTS = {
  flaky: 'Passes and fails on and off',
  failing: 'Fails every time: broken, not flaky',
  regressed: 'Passed, then failed from one run on',
  recovered: 'Failed, then passed from one run on',
  stable: 'Passes every time',
  'not-enough-data': 'Needs at least 4 passed or failed results',
};

const shortDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const describeResult = (h) =>
  `${h.result === 'passed' ? 'Passed' : 'Failed'} · ${formatDate(h.at)} · run #${h.runId} (${h.suiteName})${h.notes ? `. ${h.notes}` : ''}`;

// Results as a row of small squares, oldest on the left. Each has a ✓ or ✕, so it's not colour alone.
function HistoryStrip({ history }) {
  const passed = history.filter((h) => h.result === 'passed').length;
  return (
    <ol className="history-strip" aria-label={`Last ${history.length} results, oldest first: ${passed} passed, ${history.length - passed} failed`}>
      {history.map((h, i) => (
        <li
          key={`${h.runId}-${i}`}
          className={`history-cell history-${h.result}`}
          title={describeResult(h)}
        >
          <span aria-hidden="true">{h.result === 'passed' ? '✓' : '✕'}</span>
          {/* QA-03: screen readers read each result's details; the tooltip is only for mouse users. */}
          <span className="visually-hidden">{describeResult(h)}</span>
        </li>
      ))}
    </ol>
  );
}

// The root-cause column. With AI on (ANTHROPIC_API_KEY on the server), a missing or out-of-date
// hypothesis gets a "Write with AI" button; new flakes get one written automatically.
function Hypothesis({ row, aiEnabled, writeProtected, onWrite }) {
  const { hypothesis, ai } = row;
  const needsOne = !hypothesis || hypothesis.outdated;
  const action = aiEnabled && needsOne && (
    <div className="hypothesis-ai">
      {ai.writing ? (
        <span className="muted small" role="status">Claude is writing a hypothesis…</span>
      ) : (
        <button
          type="button"
          className="button button-small"
          onClick={() => onWrite(row)}
          aria-label={`${hypothesis ? 'Rewrite' : 'Write'} the root-cause hypothesis with AI for: ${row.title}`}
        >
          {hypothesis ? 'Rewrite with AI' : 'Write with AI'}
        </button>
      )}
      {ai.error && !ai.writing && <p className="form-error small" role="alert">Couldn't write it: {ai.error}</p>}
    </div>
  );

  if (!hypothesis) {
    return (
      <>
        <p className="hypothesis-missing">
          {/* QA-02: setup hints only where someone can act on them, not on the public (write-protected) site. */}
          {aiEnabled || writeProtected ? 'No hypothesis yet.' : <>No hypothesis yet. Ask Claude to run the <code>flake-analyzer</code> agent, or add <code>ANTHROPIC_API_KEY</code> to write them automatically.</>}
        </p>
        {action}
      </>
    );
  }
  return (
    <div className="hypothesis">
      <p>{hypothesis.text}</p>
      {hypothesis.evidence && <p className="hypothesis-evidence"><span className="label">Evidence:</span> {hypothesis.evidence}</p>}
      <p className="hypothesis-meta">
        <span className={`confidence confidence-${hypothesis.confidence}`}>{hypothesis.confidence} confidence</span>
        <span>by {hypothesis.writtenBy} · {shortDay(hypothesis.writtenAt)}</span>
        {hypothesis.outdated && <span className="hypothesis-outdated" title="Written before the newest results">Out of date</span>}
      </p>
      {action}
    </div>
  );
}

function Card({ label, value, detail, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-${tone}` : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}

export default function FlakyTestsPage() {
  const [board, setBoard] = useState(null);
  const [all, setAll] = useState(null);
  const [error, setError] = useState(''); // the first load failed
  const [refreshError, setRefreshError] = useState(''); // a later refresh failed; older data still shown
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(null); // the row whose hypothesis would be replaced
  const [now, setNow] = useState(Date.now());
  const hasData = useRef(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [b, h] = await Promise.all([flakyApi.leaderboard(), flakyApi.history()]);
      setBoard(b);
      setAll(h.items);
      hasData.current = true;
      setError('');
      setRefreshError('');
      setNow(Date.now());
    } catch (err) {
      // QA-01: once data is on screen, a failed refresh is shown above it instead of being lost.
      if (hasData.current) setRefreshError(err.message);
      else setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While Claude is writing a hypothesis (automatically for a new flake, or from the button),
  // check again every 3 seconds so it appears without a manual refresh.
  const writing = board?.top.some((t) => t.ai.writing);
  useEffect(() => {
    if (!writing) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [writing, load]);

  // QA-05: replacing an existing hypothesis asks first (it can't be undone and is a billed request).
  const requestWrite = (row) => (row.hypothesis ? setConfirmRewrite(row) : writeWithAi(row.testCaseId));

  const writeWithAi = async (testCaseId) => {
    const mark = (ai) => setBoard((b) => ({ ...b, top: b.top.map((t) => (t.testCaseId === testCaseId ? { ...t, ai } : t)) }));
    mark({ writing: true, error: null });
    try {
      await flakyApi.writeHypothesis(testCaseId);
    } catch (err) {
      mark({ writing: false, error: err.message });
      return;
    }
    load();
  };

  if (error && !board) {
    return (
      <main className="page">
        <h1>Flaky tests</h1>
        <p className="form-error" role="alert">Couldn't load flaky tests: {error}</p>
        <button type="button" className="button" onClick={load}>Try again</button>
      </main>
    );
  }
  if (!board) return <main className="page"><h1>Flaky tests</h1><p className="page-loading" role="status">Loading…</p></main>;

  const { summary, top } = board;
  const others = all.filter((t) => t.status !== 'flaky');
  const order = ['failing', 'regressed', 'recovered', 'stable', 'not-enough-data'];
  others.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.title.localeCompare(b.title));

  return (
    <main className="page">
      <div className="page-header">
        <h1>Flaky tests</h1>
        <button type="button" className="button" onClick={load} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>
      </div>
      {refreshError && (
        <p className="form-error" role="alert">
          Couldn't refresh: {refreshError}{/[.!?]$/.test(refreshError) ? '' : '.'} The tables below show the data from {formatDate(new Date(now).toISOString())}.
        </p>
      )}
      <p className="hint">
        A test is flaky when it passes and fails on and off across runs. The score is how often its result changed from one run to the next, over its last {summary.historyLimit} passed or failed results. When a test turns flaky, a Discord alert is sent{summary.aiEnabled ? ' and Claude writes a root-cause hypothesis' : ''}.
      </p>

      <div className="metric-grid">
        <Card label="Test cases tracked" value={summary.tracked} detail="with at least one result in a run" />
        <Card label="Flaky" value={summary.flaky} detail={summary.flaky ? 'pass and fail on and off' : 'none right now'} tone={summary.flaky ? 'warning' : undefined} />
        <Card label="New this week" value={summary.newThisWeek} detail="turned flaky in the last 7 days" />
        <Card label="Always failing" value={summary.failing} detail="broken, not flaky" />
      </div>

      <section aria-labelledby="leaderboard-title">
        <div className="section-header">
          <h2 id="leaderboard-title">Flakiest tests{top.length ? ` (top ${top.length})` : ''}</h2>
        </div>
        {top.length === 0 ? (
          <div className="empty-panel">
            <p>No flaky tests. A test shows up here once it has passed and failed on and off in at least 4 runs.</p>
            <Link to="/test-runs">Go to test runs →</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="flaky-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Test case</th>
                  <th className="num">Score</th>
                  <th>History</th>
                  <th>Likely root cause</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t) => (
                  <tr key={t.testCaseId}>
                    <td className="num flaky-rank">{t.rank}</td>
                    <td className="flaky-title">
                      <Link to={`/test-cases?edit=${t.testCaseId}`}>{t.title}</Link>
                      <div className="flaky-badges">
                        <SeverityBadge severity={t.severity} />
                        {t.isNew && <span className="new-badge">New</span>}
                      </div>
                      {t.lastFailedAt && (
                        <p className="muted small">
                          Last failed {formatRelative(t.lastFailedAt, now)}
                          {t.lastFailureNotes && <span className="last-failure-notes">“{t.lastFailureNotes}”</span>}
                        </p>
                      )}
                    </td>
                    <td className="num">
                      <div className="flaky-score">{t.score}%</div>
                      <div className="score-bar" aria-hidden="true"><span style={{ width: `${t.score}%` }} /></div>
                      <div className="muted small nowrap">{t.failed} of {t.total} failed</div>
                    </td>
                    <td><HistoryStrip history={t.history} /></td>
                    <td className="flaky-hypothesis">
                      {/* On a write-protected site (the deployed one) the browser has no token, so no button. */}
                      <Hypothesis row={t} aiEnabled={summary.aiEnabled && !summary.writeProtected} writeProtected={summary.writeProtected} onWrite={requestWrite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="all-title" className="flaky-all">
        <div className="section-header">
          <h2 id="all-title">Every other test case</h2>
        </div>
        {others.length === 0 ? (
          <p className="muted">No other test cases have results yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Test case</th><th>State</th><th className="num">Passed</th><th className="num">Failed</th><th>History</th></tr>
              </thead>
              <tbody>
                {others.map((t) => (
                  <tr key={t.testCaseId}>
                    <td className="title-cell"><Link to={`/test-cases?edit=${t.testCaseId}`}>{t.title}</Link></td>
                    <td className="nowrap">
                      <span className={`test-state test-state-${t.status}`} title={STATUS_HINTS[t.status]}>{STATUS_LABELS[t.status]}</span>
                    </td>
                    <td className="num">{t.passed}</td>
                    <td className="num">{t.failed}</td>
                    <td>
                      {t.history.length ? <HistoryStrip history={t.history} /> : <span className="muted small">{t.skipped} skipped, nothing passed or failed yet</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirmRewrite && (
        <Modal title="Replace the hypothesis?" onClose={() => setConfirmRewrite(null)}>
          <p>
            The current root-cause hypothesis for “{confirmRewrite.title}” (by {confirmRewrite.hypothesis.writtenBy}) will be replaced
            with a new one from Claude. This can't be undone, and it uses one Claude API request.
          </p>
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setConfirmRewrite(null)}>Cancel</button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                const id = confirmRewrite.testCaseId;
                setConfirmRewrite(null);
                writeWithAi(id);
              }}
            >
              Replace it
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
