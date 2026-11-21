import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { dashboardApi } from '../api.js';
import { formatDate, formatDuration, formatRelative } from '../format.js';

const REFRESH_MS = 30_000;

// "bug #42 marked resolved", "bug #3 reported", "bug #3 got a comment".
function describeActivity(item) {
  if (item.action === 'created') return 'reported';
  if (item.action === 'status_change') return `marked ${item.newValue}`;
  if (item.action === 'comment') return 'got a comment';
  return item.action;
}

function MetricCard({ label, value, detail, to }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
      {to && <Link className="metric-link" to={to.href}>{to.text} →</Link>}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <p className="visually-hidden" role="status">Loading the dashboard…</p>
      <div className="metric-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="metric-card">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
      <div className="dashboard-columns" aria-hidden="true">
        {[0, 1].map((i) => (
          <section key={i} className="dashboard-panel">
            <div className="skeleton skeleton-line short" />
            {[0, 1, 2, 3, 4].map((j) => <div key={j} className="skeleton skeleton-row" />)}
          </section>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(''); // first load failed
  const [refreshError, setRefreshError] = useState(''); // a later refresh failed; older data still shown
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const latestRequest = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current; // ignore replies that arrive after a newer request
    setRefreshing(true);
    try {
      const next = await dashboardApi.metrics();
      if (requestId !== latestRequest.current) return;
      setData(next);
      hasData.current = true;
      setError('');
      setRefreshError('');
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      // Keep showing the last good data if there is some; otherwise show the error screen.
      if (hasData.current) setRefreshError(err.message);
      else setError(err.message);
    } finally {
      if (requestId === latestRequest.current) setRefreshing(false);
      setNow(Date.now());
    }
  }, []);

  // Load now, then every 30 seconds. Skips while the tab is hidden, and refreshes as soon as it's shown again.
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const handleVisible = () => !document.hidden && load();
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [load]);

  const retry = () => {
    setError('');
    load();
  };

  const header = (
    <div className="page-header">
      <h1>Dashboard</h1>
      {data && (
        <div className="dashboard-updated">
          <span className="muted small" role="status">
            {refreshing ? 'Refreshing…' : `Updated ${formatDate(data.generatedAt)} · refreshes every 30 seconds`}
          </span>
          <button type="button" className="button" onClick={load} disabled={refreshing}>↻ Refresh</button>
        </div>
      )}
    </div>
  );

  if (error && !data) {
    return (
      <main className="page">
        {header}
        <div className="dashboard-message" role="alert">
          <h2>Couldn't load the dashboard</h2>
          <p>{error}</p>
          <button type="button" className="button button-primary" onClick={retry}>Try again</button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        {header}
        <DashboardSkeleton />
      </main>
    );
  }

  const { metrics, recentRuns, recentActivity } = data;
  const nothingYet = metrics.totalTestCases === 0 && recentRuns.length === 0 && recentActivity.length === 0;

  if (nothingYet) {
    return (
      <main className="page">
        {header}
        <div className="dashboard-message">
          <h2>No data yet</h2>
          <p>
            Write some <Link to="/test-cases">test cases</Link>, group them into a{' '}
            <Link to="/test-suites">test suite</Link> and start a run, or report a <Link to="/bugs">bug</Link>.
            The numbers show up here as soon as there's something to count.
          </p>
        </div>
      </main>
    );
  }

  const basis = metrics.passRateBasis;
  const open = metrics.openBugsByStatus;

  return (
    <main className="page">
      {header}

      {refreshError && (
        <p className="form-error" role="alert">
          Couldn't refresh: {refreshError} Showing the data from {formatDate(data.generatedAt)}; it will try again in 30 seconds.
        </p>
      )}

      <div className="metric-grid">
        <MetricCard
          label="Test cases"
          value={metrics.totalTestCases}
          detail="in the test case library"
          to={{ href: '/test-cases', text: 'Test cases' }}
        />
        <MetricCard
          label="Pass rate"
          value={metrics.passRate === null ? '–' : `${metrics.passRate}%`}
          detail={
            metrics.passRate === null
              ? 'No passed or failed results yet'
              : `${basis.passed} passed, ${basis.failed} failed in test runs${basis.skipped ? ` (${basis.skipped} skipped not counted)` : ''}`
          }
        />
        <MetricCard
          label="Open bugs"
          value={metrics.openBugs}
          detail={`${open.open} open · ${open['in-progress']} in progress · ${open.reopened} reopened`}
          to={{ href: '/bugs?status=open', text: 'Open bugs' }}
        />
        <MetricCard
          label="Average run time"
          value={metrics.averageRunDurationMs === null ? '–' : formatDuration(metrics.averageRunDurationMs)}
          detail={
            metrics.finishedRuns === 0
              ? 'No finished runs yet'
              : `over ${metrics.finishedRuns} finished run${metrics.finishedRuns > 1 ? 's' : ''}, start to finish`
          }
        />
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-panel" aria-labelledby="recent-runs">
          <div className="section-header">
            <h2 id="recent-runs">Recent test runs</h2>
            <Link to="/test-runs">All runs →</Link>
          </div>
          {recentRuns.length === 0 ? (
            <p className="muted">No test runs yet. Start one from a suite's page with “▶ New run”.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Suite</th>
                    <th>Status</th>
                    <th className="num">Passed</th>
                    <th className="num">Failed</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td><Link to={`/test-runs/${run.id}`}>{run.suiteName}</Link> <span className="muted small">#{run.id}</span></td>
                      <td><span className={`status-text status-${run.status}`}>{run.status}</span></td>
                      <td className="num status-passed">{run.passCount}</td>
                      <td className="num status-failed">{run.failCount}</td>
                      <td className="nowrap" title={formatDate(run.startTime)}>{formatRelative(run.startTime, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="recent-activity">
          <div className="section-header">
            <h2 id="recent-activity">Recent bug activity</h2>
            <Link to="/bugs">All bugs →</Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="muted">No bug activity yet.</p>
          ) : (
            <ol className="activity-feed">
              {recentActivity.map((item) => (
                <li key={item.id}>
                  <div>
                    <Link to={`/bugs/${item.bugId}`}>bug #{item.bugId}</Link>{' '}
                    {item.action === 'status_change' ? (
                      <>marked <span className={`status-text status-${item.newValue}`}>{item.newValue}</span></>
                    ) : (
                      describeActivity(item)
                    )}
                    <div className="muted small activity-title">{item.bugTitle}</div>
                  </div>
                  <time className="muted small nowrap" dateTime={item.timestamp} title={formatDate(item.timestamp)}>
                    {formatRelative(item.timestamp, now)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
