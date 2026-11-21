import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { testRunsApi } from '../api.js';
import { TEST_RUN_STATUSES } from '../constants.js';
import { formatDate } from '../format.js';

export default function TestRunsPage() {
  const [params, setParams] = useSearchParams();
  const status = TEST_RUN_STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const update = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) (v ? next.set(k, String(v)) : next.delete(k));
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    testRunsApi
      .list({ status, page })
      .then((data) => !cancelled && (setResult(data), setLoadError('')))
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, page, reloadKey]);

  const items = result?.items ?? [];

  return (
    <main className="page">
      <div className="page-header">
        <h1>Test runs</h1>
      </div>
      <p className="hint">Start a run from a suite's page with “▶ New run”.</p>

      <div className="toolbar">
        <select value={status} onChange={(e) => update({ status: e.target.value, page: null })} aria-label="Filter by status">
          <option value="">All statuses</option>
          {TEST_RUN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          Could not load test runs: {loadError}{' '}
          <button type="button" className="link-button" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </p>
      )}

      <div className={`table-wrap${loading ? ' is-loading' : ''}`} aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Suite</th>
              <th>Status</th>
              <th className="num">Passed</th>
              <th className="num">Failed</th>
              <th className="num">Skipped</th>
              <th>Started</th>
              <th>Run by</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => {
              const pending = run.caseCount - run.passCount - run.failCount - run.skipCount;
              return (
                <tr key={run.id}>
                  <td className="num muted">{run.id}</td>
                  <td className="title-cell">
                    <Link to={`/test-runs/${run.id}`}>{run.suiteName}</Link>
                    {pending > 0 && <span className="muted small"> · {pending} of {run.caseCount} not run yet</span>}
                  </td>
                  <td><span className={`status-text status-${run.status}`}>{run.status}</span></td>
                  <td className="num status-passed">{run.passCount}</td>
                  <td className="num status-failed">{run.failCount}</td>
                  <td className="num muted">{run.skipCount}</td>
                  <td className="nowrap">{formatDate(run.startTime)}</td>
                  <td>{run.createdBy}</td>
                </tr>
              );
            })}
            {!result && loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {result && items.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  {status ? `No runs with status "${status}".` : (
                    <>No test runs yet. Open a suite on the <Link to="/test-suites">Test suites</Link> page and click “▶ New run”.</>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <span role="status">Page {result.page} of {result.totalPages}</span>
          <div className="pagination-buttons">
            <button type="button" className="button" onClick={() => update({ page: page - 1 > 1 ? page - 1 : null })} disabled={page <= 1}>
              ← Previous
            </button>
            <button type="button" className="button" onClick={() => update({ page: page + 1 })} disabled={page >= result.totalPages}>
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
