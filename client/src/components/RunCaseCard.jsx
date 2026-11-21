import { useEffect, useRef, useState } from 'react';
import { testRunsApi } from '../api.js';
import { formatDate, formatDuration } from '../format.js';
import SeverityBadge from './SeverityBadge.jsx';

const BUTTONS = [
  { result: 'passed', label: '✓ Pass' },
  { result: 'failed', label: '✗ Fail' },
  { result: 'skipped', label: '– Skip' },
];

// One test case inside a run: its steps, the Pass / Fail / Skip buttons, and notes.
// Failing needs notes; the server then posts a Discord alert and reports whether it went out.
export default function RunCaseCard({ runId, item, onSaved, onDirtyChange }) {
  const [notes, setNotes] = useState(item.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notesRef = useRef(null);
  const notesId = `notes-${item.id}`;

  const dirty = notes.trim() !== (item.notes ?? '');
  useEffect(() => {
    onDirtyChange(item.id, dirty);
  }, [item.id, dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(item.id, false), [item.id, onDirtyChange]);

  const record = async (result) => {
    if (result === 'failed' && !notes.trim()) {
      setError('Write what went wrong in the notes first. It goes into the Discord alert.');
      notesRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const run = await testRunsApi.recordResult(runId, item.id, result, notes);
      const saved = run.results.find((r) => r.id === item.id);
      setNotes(saved?.notes ?? '');
      onSaved(run, result === 'failed' ? saved : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`run-case${item.result ? ` run-case-${item.result}` : ''}`}>
      <div className="run-case-head">
        <span className="case-position">{item.position}.</span>
        <span className="case-title">{item.title}</span>
        <SeverityBadge severity={item.severity} />
        <span className={`status-text status-${item.result ?? 'not-run'}`}>{item.result ?? 'not run'}</span>
        {item.durationMs != null && <span className="muted small" title="Time since the previous result">{formatDuration(item.durationMs)}</span>}
      </div>

      <details className="run-case-details">
        <summary>Steps and expected result</summary>
        {item.preconditions && (
          <p><span className="label">Preconditions:</span> {item.preconditions}</p>
        )}
        <ol className="bug-steps">
          {item.steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        <p><span className="label">Expected:</span> {item.expectedResult}</p>
      </details>

      <div className="run-case-actions">
        <div className="result-buttons" role="group" aria-label={`Result for "${item.title}"`}>
          {BUTTONS.map((b) => (
            <button
              key={b.result}
              type="button"
              className={`button result-${b.result}`}
              aria-pressed={item.result === b.result}
              onClick={() => record(b.result)}
              disabled={busy}
            >
              {b.label}
            </button>
          ))}
        </div>
        <label htmlFor={notesId} className="visually-hidden">Notes for "{item.title}"</label>
        <textarea
          id={notesId}
          ref={notesRef}
          className="run-case-notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setError('');
          }}
          rows={2}
          maxLength={2000}
          placeholder="Notes (required when failing: what went wrong?)"
          disabled={busy}
        />
        {dirty && item.result && (
          <button type="button" className="button" onClick={() => record(item.result)} disabled={busy}>
            {busy ? 'Saving…' : 'Save notes'}
          </button>
        )}
      </div>

      {busy && <p className="muted small" role="status">Saving…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {item.result === 'failed' && item.alertSentAt && (
        <p className="alert-line">🔔 Discord alert sent {formatDate(item.alertSentAt)}</p>
      )}
      {item.result === 'failed' && !item.alertSentAt && item.alertError && (
        <p className="alert-line alert-line-error">
          ⚠ Discord alert not sent: {item.alertError}{' '}
          <button type="button" className="link-button" onClick={() => record('failed')} disabled={busy}>
            Try again
          </button>
        </p>
      )}
    </li>
  );
}
