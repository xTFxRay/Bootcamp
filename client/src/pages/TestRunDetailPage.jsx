import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { reportsApi, testRunsApi } from '../api.js';
import { formatDate, formatDuration } from '../format.js';
import { useLeaveWarning } from '../use-leave-warning.js';
import RunCaseCard from '../components/RunCaseCard.jsx';

export default function TestRunDetailPage() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // { text, id }
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const handleGenerateReport = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const report = await reportsApi.create(Number(id));
      navigate(`/reports/${report.id}`);
    } catch (err) {
      setGenerateError(err.message);
      setGenerating(false);
    }
  };

  // Which cases have typed notes that aren't saved yet.
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const handleDirtyChange = useCallback((caseId, dirty) => {
    setDirtyIds((prev) => {
      if (prev.has(caseId) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(caseId);
      else next.delete(caseId);
      return next;
    });
  }, []);
  useLeaveWarning(dirtyIds.size > 0, 'Leave this run? Notes you typed but did not save will be lost.');

  const load = useCallback(async () => {
    try {
      setRun(await testRunsApi.get(id));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setRun(null);
    load();
  }, [load]);

  const handleSaved = (updated, failedItem) => {
    setRun(updated);
    let text = 'Result saved.';
    if (failedItem?.alertSentAt) text = 'Marked failed. A Discord alert was sent.';
    else if (failedItem?.alertError) text = 'Marked failed, but the Discord alert was not sent.';
    if (updated.newFlake) {
      text += ` “${updated.newFlake.title}” is now flaky (${updated.newFlake.score}%)`;
      text += updated.newFlake.alert?.ok ? ': a Discord alert was sent.' : ', but the Discord alert was not sent.';
      if (updated.newFlake.aiHypothesis === 'writing') text += ' Claude is writing a root-cause hypothesis on the Flaky tests page.';
    }
    if (updated.status !== 'in-progress' && run?.status === 'in-progress') {
      text += ` All cases are done: the run ${updated.status}.`;
    }
    setNotice({ text, id: Date.now() });
  };

  if (loadError) {
    const notFound = loadError === 'Test run not found';
    return (
      <main className="page">
        <p className="back-link"><Link to="/test-runs">← Test runs</Link></p>
        <h1>{notFound ? 'Test run not found' : "Couldn't load this test run"}</h1>
        <p>{notFound ? 'It may have been deleted.' : loadError}</p>
        {!notFound && <button type="button" className="button" onClick={load}>Try again</button>}
      </main>
    );
  }
  if (!run) return <main className="page"><p className="page-loading" role="status">Loading…</p></main>;

  const done = run.passCount + run.failCount + run.skipCount;
  const percent = (n) => `${(n / run.caseCount) * 100}%`;
  const totalMs = run.results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);

  return (
    <main className="page">
      <p className="back-link"><Link to="/test-runs">← Test runs</Link></p>

      <div className="page-header">
        <h1><span className="muted">Run #{run.id}</span> {run.suiteName}</h1>
        <div className="header-actions">
          {run.suiteId && <Link className="button" to={`/test-suites/${run.suiteId}`}>Open the suite</Link>}
          <button
            type="button"
            className="button button-primary"
            onClick={handleGenerateReport}
            disabled={generating}
            aria-busy={generating}
            title={run.status === 'in-progress' ? 'The report will show cases without a result as "not run".' : undefined}
          >
            {generating ? 'Generating…' : 'Generate report'}
          </button>
        </div>
      </div>
      {generateError && <p className="form-error" role="alert">Could not generate the report: {generateError}</p>}

      <dl className="suite-meta">
        <div><dt>Status</dt><dd><span className={`status-text status-${run.status}`}>{run.status}</span></dd></div>
        <div><dt>Progress</dt><dd>{done} of {run.caseCount} done</dd></div>
        <div><dt>Passed / failed / skipped</dt><dd><span className="status-passed">{run.passCount}</span> / <span className="status-failed">{run.failCount}</span> / <span className="muted">{run.skipCount}</span></dd></div>
        <div><dt>Started</dt><dd>{formatDate(run.startTime)}</dd></div>
        <div><dt>Finished</dt><dd>{run.endTime ? formatDate(run.endTime) : <span className="muted">Not yet</span>}</dd></div>
        <div><dt>Time spent</dt><dd>{formatDuration(totalMs) || '0s'}</dd></div>
        <div><dt>Run by</dt><dd>{run.createdBy}</dd></div>
      </dl>

      <div
        className="run-progress"
        role="img"
        aria-label={`${run.passCount} passed, ${run.failCount} failed, ${run.skipCount} skipped, ${run.caseCount - done} not run`}
      >
        <span className="run-progress-passed" style={{ width: percent(run.passCount) }} />
        <span className="run-progress-failed" style={{ width: percent(run.failCount) }} />
        <span className="run-progress-skipped" style={{ width: percent(run.skipCount) }} />
      </div>

      <div role="status" className="notice-slot">
        {notice && <p key={notice.id} className="notice">{notice.text}</p>}
      </div>

      <p className="hint">
        Open “Steps and expected result”, try it, then click Pass, Fail or Skip. Failing needs notes, and sends a Discord alert.
      </p>

      <ol className="run-cases">
        {run.results.map((item) => (
          <RunCaseCard
            key={item.id}
            runId={run.id}
            item={item}
            onSaved={handleSaved}
            onDirtyChange={handleDirtyChange}
          />
        ))}
      </ol>
    </main>
  );
}
