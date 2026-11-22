import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { dashboardApi } from '../api.js';
import { formatDate, formatDuration, formatRelative } from '../format.js';
import { BugsPerWeekChart, CoverageDonutChart, PassRateTrendChart } from '../components/DashboardCharts.jsx';

const REFRESH_MS = 30_000;

// "bug #42 marked resolved", "bug #3 reported", "bug #3 got a comment".
function describeActivity(item) {
  if (item.action === 'created') return 'reported';
  if (item.action === 'status_change') return `marked ${item.newValue}`;
  if (item.action === 'comment') return 'got a comment';
  return item.action;
}

// A headline number. With `empty`, the value is shown as a short muted phrase (not a lone "–")
// and the link is styled as the next thing to do.
function MetricCard({ label, value, detail, to, empty = false }) {
  return (
    <div className={`metric-card${empty ? ' metric-card-empty' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className={empty ? 'metric-value metric-value-empty' : 'metric-value'}>{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
      {to && <Link className={empty ? 'metric-link metric-link-action' : 'metric-link'} to={to.href}>{to.text} →</Link>}
    </div>
  );
}

// A friendly "nothing here yet" box: what's missing, why, and a button for the next step.
function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <Link className="button button-primary" to={action.href}>{action.text}</Link>}
    </div>
  );
}

// Where to send someone who wants to start a test run, depending on what exists so far.
function nextStepForRuns(m) {
  if (m.totalTestCases === 0) {
    return {
      text: 'Add test cases, group them into a suite, then start a run from it.',
      action: { href: '/test-cases', text: 'Add your first test case' },
    };
  }
  if (m.totalSuites === 0) {
    return {
      text: 'Group your test cases into a test suite, then start a run from it.',
      action: { href: '/test-suites', text: 'Create a test suite' },
    };
  }
  return {
    text: 'Open a suite and click “▶ New run” to start your first run.',
    action: { href: '/test-suites', text: 'Go to test suites' },
  };
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
      const [next, trends] = await Promise.all([dashboardApi.metrics(), dashboardApi.trends()]);
      if (requestId !== latestRequest.current) return;
      setData({ ...next, trends });
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

  const { metrics, recentRuns, recentActivity, trends } = data;
  const nothingYet =
    metrics.totalTestCases === 0 && metrics.totalRuns === 0 && metrics.totalBugs === 0 && recentActivity.length === 0;
  const basis = metrics.passRateBasis;
  const open = metrics.openBugsByStatus;
  const runsStep = nextStepForRuns(metrics);
  // Card links for "no runs yet": the label says where the link really goes.
  const startRunLink = {
    href: runsStep.action.href,
    text:
      metrics.totalTestCases === 0
        ? 'Add test cases first'
        : metrics.totalSuites === 0
          ? 'Create a test suite first'
          : 'Start a test run',
  };
  // A run exists but nothing finished / no pass-fail yet: point at the runs to finish them.
  const toRuns = { href: '/test-runs', text: 'Go to test runs' };

  return (
    <main className="page">
      {header}

      {refreshError && (
        <p className="form-error" role="alert">
          Couldn't refresh: {refreshError} Showing the data from {formatDate(data.generatedAt)}; it will try again in 30 seconds.
        </p>
      )}

      {nothingYet && (
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <h2 id="welcome-title">Welcome! Your dashboard fills in as you work</h2>
          <ol>
            <li><Link to="/test-cases">Add your first test case</Link>: what to check, step by step.</li>
            <li><Link to="/test-suites">Group test cases into a suite</Link>, then click “▶ New run” to run them.</li>
            <li><Link to="/bugs">Report a bug</Link> when something doesn't work.</li>
          </ol>
        </section>
      )}

      <div className="metric-grid">
        {metrics.totalTestCases === 0 ? (
          <MetricCard
            empty
            label="Test cases"
            value="None yet"
            detail="Test cases describe what to check and the result you expect."
            to={{ href: '/test-cases', text: 'Add your first test case' }}
          />
        ) : (
          <MetricCard
            label="Test cases"
            value={metrics.totalTestCases}
            detail="in the test case library"
            to={{ href: '/test-cases', text: 'Test cases' }}
          />
        )}

        {metrics.passRate === null ? (
          <MetricCard
            empty
            label="Pass rate"
            value="No results yet"
            detail={
              metrics.totalRuns === 0
                ? 'It appears once a test run has cases marked passed or failed.'
                : 'Open a run and mark its cases Pass or Fail to see a pass rate.'
            }
            to={metrics.totalRuns === 0 ? startRunLink : toRuns}
          />
        ) : (
          <MetricCard
            label="Pass rate"
            value={`${metrics.passRate}%`}
            detail={`${basis.passed} passed, ${basis.failed} failed in test runs${basis.skipped ? ` (${basis.skipped} skipped not counted)` : ''}`}
          />
        )}

        {metrics.totalBugs === 0 ? (
          <MetricCard
            empty
            label="Open bugs"
            value="None reported"
            detail="Found something that doesn't work? Write it up so it gets fixed."
            to={{ href: '/bugs', text: 'Report a bug' }}
          />
        ) : metrics.openBugs === 0 ? (
          <MetricCard
            label="Open bugs"
            value="0"
            detail={`Nothing open: all ${metrics.totalBugs} bug${metrics.totalBugs > 1 ? 's are' : ' is'} resolved or closed.`}
            to={{ href: '/bugs', text: 'See all bugs' }}
          />
        ) : (
          <MetricCard
            label="Open bugs"
            value={metrics.openBugs}
            detail={`${open.open} open · ${open['in-progress']} in progress · ${open.reopened} reopened`}
            to={{ href: '/bugs?status=open', text: 'Open bugs' }}
          />
        )}

        {metrics.averageRunDurationMs === null ? (
          <MetricCard
            empty
            label="Average run time"
            value="No finished runs"
            detail={
              metrics.totalRuns === 0
                ? 'It appears once a test run is finished.'
                : 'A run finishes when every case has a result.'
            }
            to={metrics.totalRuns === 0 ? startRunLink : toRuns}
          />
        ) : (
          <MetricCard
            label="Average run time"
            value={formatDuration(metrics.averageRunDurationMs)}
            detail={`over ${metrics.finishedRuns} finished run${metrics.finishedRuns > 1 ? 's' : ''}, start to finish`}
          />
        )}
      </div>

      {!nothingYet && (
        <section aria-labelledby="trends-title">
          <div className="section-header">
            <h2 id="trends-title">Trends</h2>
          </div>
          <div className="chart-grid-layout">
            <PassRateTrendChart runs={trends.passRateTrend} emptyAction={startRunLink} />
            <BugsPerWeekChart weeks={trends.bugsPerWeek} />
            <CoverageDonutChart coverage={trends.coverage} />
          </div>
        </section>
      )}

      <div className="dashboard-columns">
        <section className="dashboard-panel" aria-labelledby="recent-runs">
          <div className="section-header">
            <h2 id="recent-runs">Recent test runs</h2>
            {recentRuns.length > 0 && <Link to="/test-runs">All runs →</Link>}
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState icon="🧪" title="No test runs yet" action={runsStep.action}>
              {runsStep.text}
            </EmptyState>
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
            {recentActivity.length > 0 && <Link to="/bugs">All bugs →</Link>}
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState icon="🐞" title="No bug activity yet" action={{ href: '/bugs', text: 'Report a bug' }}>
              When a bug is reported, changes status or gets a comment, it shows up here.
            </EmptyState>
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
