import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { reportsApi } from '../api.js';
import { formatDate, formatDuration } from '../format.js';
import SeverityBadge from '../components/SeverityBadge.jsx';

export default function ReportDetailPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      setReport(await reportsApi.get(id));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setReport(null);
    load();
  }, [load]);

  if (loadError) {
    const notFound = loadError === 'Report not found';
    return (
      <main className="page">
        <p className="back-link"><Link to="/reports">← Reports</Link></p>
        <h1>{notFound ? 'Report not found' : "Couldn't load this report"}</h1>
        <p>{notFound ? 'Check the address, or pick a report from the list.' : loadError}</p>
        {!notFound && <button type="button" className="button" onClick={load}>Try again</button>}
      </main>
    );
  }
  if (!report) return <main className="page"><p>Loading…</p></main>;

  const decided = report.passedCount + report.failedCount;
  const passRate = decided ? `${Math.round((report.passedCount / decided) * 1000) / 10}%` : '—';

  return (
    <main className="page report-page">
      <p className="back-link no-print"><Link to="/reports">← Reports</Link></p>

      <div className="page-header">
        <h1><span className="muted">Report #{report.id}</span> {report.suiteName}</h1>
        <div className="header-actions no-print">
          <a className="button" href={reportsApi.exportHtmlUrl(report.id)} download>Download HTML</a>
          <button type="button" className="button button-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      <dl className="suite-meta">
        <div>
          <dt>Test run</dt>
          <dd>{report.runId ? <Link to={`/test-runs/${report.runId}`}>Run #{report.runId}</Link> : <span className="muted">Deleted</span>}</dd>
        </div>
        <div><dt>Run status</dt><dd><span className={`status-text status-${report.runStatus}`}>{report.runStatus}</span></dd></div>
        <div><dt>Run started</dt><dd>{formatDate(report.runDate)}</dd></div>
        <div><dt>Generated</dt><dd>{formatDate(report.generatedAt)}</dd></div>
      </dl>

      {report.notRunCount > 0 && (
        <p className="notice">
          This run wasn't finished when the report was generated: {report.notRunCount} of {report.totalCount} cases had no result yet.
        </p>
      )}

      <div className="report-summary">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value">{report.totalCount}</div></div>
        <div className="metric-card"><div className="metric-label">Passed</div><div className="metric-value status-passed">{report.passedCount}</div></div>
        <div className="metric-card"><div className="metric-label">Failed</div><div className="metric-value status-failed">{report.failedCount}</div></div>
        <div className="metric-card"><div className="metric-label">Skipped</div><div className="metric-value muted">{report.skippedCount}</div></div>
        <div className="metric-card"><div className="metric-label">Pass rate</div><div className="metric-value">{passRate}</div></div>
      </div>

      <div className="table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Test case</th>
              <th>Severity</th>
              <th>Result</th>
              <th className="num">Time</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {report.results.map((r) => (
              <tr key={r.position}>
                <td className="num muted">{r.position}</td>
                <td className="title-cell">{r.title}</td>
                <td><SeverityBadge severity={r.severity} /></td>
                <td><span className={`status-text status-${r.result.replace(' ', '-')}`}>{r.result}</span></td>
                <td className="num nowrap">{formatDuration(r.durationMs)}</td>
                <td className="prewrap">{r.notes}</td>
              </tr>
            ))}
            {report.results.length === 0 && (
              <tr><td colSpan={6} className="empty">This run had no test cases.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="hint">Pass rate counts passed and failed cases only; skipped and not-run cases are left out.</p>
    </main>
  );
}
