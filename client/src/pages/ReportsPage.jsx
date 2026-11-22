import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { reportsApi } from '../api.js';
import { formatDate } from '../format.js';

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const goToPage = (p) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p > 1) next.set('page', String(p));
        else next.delete('page');
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportsApi
      .list({ page })
      .then((data) => !cancelled && (setResult(data), setLoadError('')))
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  const items = result?.items ?? [];

  return (
    <main className="page">
      <div className="page-header">
        <h1>Test reports</h1>
      </div>
      <p className="hint">
        A report is a snapshot of a test run's results. Make one with “Generate report” on a run's page.
      </p>

      {loadError && (
        <p className="form-error" role="alert">
          Could not load reports: {loadError}{' '}
          <button type="button" className="link-button" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </p>
      )}

      <div className={`table-wrap${loading ? ' is-loading' : ''}`} aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Suite</th>
              <th>Run</th>
              <th className="num">Total</th>
              <th className="num">Passed</th>
              <th className="num">Failed</th>
              <th className="num">Skipped</th>
              <th>Run date</th>
              <th>Generated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((report) => (
              <tr key={report.id}>
                <td className="num muted">{report.id}</td>
                <td className="title-cell">
                  <Link to={`/reports/${report.id}`}>{report.suiteName}</Link>
                  {report.notRunCount > 0 && (
                    <span className="muted small"> · {report.notRunCount} of {report.totalCount} not run</span>
                  )}
                </td>
                <td className="nowrap">
                  {report.runId ? <Link to={`/test-runs/${report.runId}`}>Run #{report.runId}</Link> : <span className="muted">Deleted</span>}
                </td>
                <td className="num">{report.totalCount}</td>
                <td className="num status-passed">{report.passedCount}</td>
                <td className="num status-failed">{report.failedCount}</td>
                <td className="num muted">{report.skippedCount}</td>
                <td className="nowrap">{formatDate(report.runDate)}</td>
                <td className="nowrap">{formatDate(report.generatedAt)}</td>
              </tr>
            ))}
            {!result && loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {result && items.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No reports yet. Open a run on the <Link to="/test-runs">Test runs</Link> page and click “Generate report”.
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
            <button type="button" className="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>← Previous</button>
            <button type="button" className="button" onClick={() => goToPage(page + 1)} disabled={page >= result.totalPages}>Next →</button>
          </div>
        </div>
      )}
    </main>
  );
}
