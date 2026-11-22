import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { testCasesApi } from '../api.js';
import { useLeaveWarning } from '../use-leave-warning.js';
import SeverityBadge from '../components/SeverityBadge.jsx';

// Import test cases from a CSV file in three steps: choose a file, check the preview, import.
// The server reads and checks the file; nothing is saved until "Import" is clicked.

const MAX_BYTES = 2 * 1024 * 1024;
const SEVERITY_NAMES = ['Critical', 'Major', 'Minor', 'Trivial'];
const ENCODING_OPTIONS = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'windows-1257', label: 'Windows-1257 (Baltic)' },
  { value: 'windows-1252', label: 'Windows-1252 (Western)' },
];

// Builds a CSV file (comma-separated, every cell quoted) and starts the download.
// The byte-order mark makes Excel open it as UTF-8, so letters like ā and é come out right.
function downloadCsv(filename, rows) {
  const csv = rows.map((cells) => cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv, '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTemplate() {
  downloadCsv('test-cases-template.csv', [
    ['Title', 'Severity', 'Steps', 'Expected result', 'Preconditions', 'Status'],
    [
      'User can sign in with a valid email and password',
      'Critical',
      '1. Open the sign-in page\n2. Enter a registered email and its password\n3. Click "Sign in"',
      'The dashboard opens and shows the user\'s name',
      'The user has an account',
      'ready',
    ],
    ['Search finds a test case by part of its title', 'Minor', 'Open Test cases | Type "log" in the search box', 'Only test cases with "log" in the title are listed', '', ''],
  ]);
}

// Very long titles (usually a mistake) are cut short so the table stays readable.
const shorten = (text, max = 120) => (text.length > max ? `${text.slice(0, max)}…` : text);

function StepsCell({ steps }) {
  if (steps.length === 0) return <span className="muted">—</span>;
  const shown = steps.slice(0, 3);
  return (
    <ol className="import-steps" title={steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}>
      {shown.map((s, i) => <li key={i}>{s}</li>)}
      {steps.length > 3 && <li className="muted">+ {steps.length - 3} more</li>}
    </ol>
  );
}

function ProblemList({ errors, warnings = [] }) {
  if (errors.length === 0 && warnings.length === 0) return <span className="import-ok">✓ Ready</span>;
  return (
    <ul className="import-problems">
      {errors.map((e) => <li key={e} className="import-error">✕ {e}</li>)}
      {warnings.map((w) => <li key={w} className="import-warning">! {w}</li>)}
    </ul>
  );
}

export default function TestCaseImportPage() {
  const [file, setFile] = useState(null);
  const [encoding, setEncoding] = useState(''); // '' = let the server detect it
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(''); // 'reading' | 'importing' | ''
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  useLeaveWarning(Boolean(preview) && !result && busy !== 'importing', 'Leave without importing? The file you checked will not be imported.');

  const readFile = async (nextFile, nextEncoding = '') => {
    setError('');
    setResult(null);
    if (nextFile.size > MAX_BYTES) {
      setFile(null);
      setPreview(null);
      setError(`“${nextFile.name}” is larger than 2 MB. Split it into smaller files and import them one at a time.`);
      return;
    }
    setFile(nextFile);
    setEncoding(nextEncoding);
    setBusy('reading');
    try {
      setPreview(await testCasesApi.previewImport(nextFile, nextEncoding));
      setOnlyProblems(false);
    } catch (err) {
      setPreview(null);
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const chooseFile = (files) => {
    const next = files?.[0];
    if (next) readFile(next);
    if (inputRef.current) inputRef.current.value = ''; // so choosing the same file again still works
  };

  const startOver = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setEncoding('');
  };

  const runImport = async () => {
    setBusy('importing');
    setError('');
    try {
      setResult(await testCasesApi.importFile(file, encoding || (preview.encoding.startsWith('utf-16') ? '' : preview.encoding)));
    } catch (err) {
      setError(`Nothing was imported: ${err.message}`);
    } finally {
      setBusy('');
    }
  };

  const downloadSkipped = () => {
    const width = Math.max(result.headers.length, ...result.skipped.map((r) => r.cells.length));
    const pad = (cells) => [...cells, ...Array(width - cells.length).fill('')];
    downloadCsv(`${file.name.replace(/\.[^.]+$/, '')}-skipped-rows.csv`, [
      [...pad(result.headers), 'Problems'],
      ...result.skipped.map((r) => [...pad(r.cells), r.errors.join('; ')]),
    ]);
  };

  // --- Step 3: done --------------------------------------------------------
  if (result) {
    return (
      <main className="page">
        <p className="back-link"><Link to="/test-cases">← Test cases</Link></p>
        <h1>Import finished</h1>
        <p className="notice" role="status">
          Imported {result.imported} test {result.imported === 1 ? 'case' : 'cases'} from “{file.name}”.
          {result.skipped.length > 0 && ` Skipped ${result.skipped.length} ${result.skipped.length === 1 ? 'row' : 'rows'} with problems.`}
        </p>

        {result.skipped.length > 0 && (
          <>
            <div className="section-header">
              <h2>Skipped rows</h2>
              <button type="button" className="button" onClick={downloadSkipped}>Download skipped rows</button>
            </div>
            <p className="hint">The download has these rows as they were in your file, plus a “Problems” column. Fix them and import that file again; the “Problems” column is ignored.</p>
            <div className="table-wrap">
              <table className="import-table">
                <thead><tr><th className="num">Row</th><th>Title</th><th>Problems</th></tr></thead>
                <tbody>
                  {result.skipped.map((r) => (
                    <tr key={r.row}>
                      <td className="num muted">{r.row}</td>
                      <td className="title-cell">{r.values.title ? shorten(r.values.title) : <span className="muted">(no title)</span>}</td>
                      <td><ProblemList errors={r.errors} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="form-actions import-actions">
          <button type="button" className="button" onClick={startOver}>Import another file</button>
          <Link className="button button-primary" to="/test-cases">Go to test cases</Link>
        </div>
      </main>
    );
  }

  const rows = preview ? (onlyProblems ? preview.rows.filter((r) => r.errors.length || r.warnings.length) : preview.rows) : [];
  const valid = preview?.totals.valid ?? 0;
  const encodingIsUtf16 = preview?.encoding.startsWith('utf-16');

  return (
    <main className="page">
      <p className="back-link"><Link to="/test-cases">← Test cases</Link></p>
      <div className="page-header">
        <h1>Import test cases from CSV</h1>
      </div>

      {/* --- Step 1: choose a file ---------------------------------------- */}
      {!preview && (
        <div className="import-start">
          <label
            className={`import-drop${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              chooseFile(e.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="visually-hidden"
              onChange={(e) => chooseFile(e.target.files)}
              disabled={Boolean(busy)}
            />
            <span className="import-drop-icon" aria-hidden="true">⇪</span>
            <strong>{busy ? `Reading “${file?.name}”…` : 'Choose a CSV file'}</strong>
            <span className="muted">or drag it here · up to 2 MB and 1,000 test cases</span>
          </label>

          <aside className="panel import-help">
            <h2>What the file needs</h2>
            <ul>
              <li>A first row naming the columns: <strong>Title</strong>, <strong>Severity</strong>, <strong>Steps</strong>, <strong>Expected result</strong>. Preconditions and Status are optional.</li>
              <li>Severity: {SEVERITY_NAMES.join(', ')}.</li>
              <li>Steps: each step on its own line inside the cell (Alt+Enter in Excel), or separated by “|”.</li>
              <li>Status: draft, ready, passed, failed, blocked or skipped. Empty means draft.</li>
              <li>Commas, semicolons or tabs between columns all work. Save as “CSV UTF-8” if you can.</li>
            </ul>
            <button type="button" className="link-button" onClick={downloadTemplate}>Download a template</button>
          </aside>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* --- Step 2: preview ---------------------------------------------- */}
      {preview && (
        <>
          <div className="import-summary" role="status">
            <p>
              <strong>“{file.name}”</strong>: {preview.totals.rows} {preview.totals.rows === 1 ? 'row' : 'rows'}.{' '}
              <span className="status-passed">{valid} ready to import</span>
              {preview.totals.invalid > 0 && <>, <span className="status-failed">{preview.totals.invalid} with problems (will be skipped)</span></>}
              {preview.totals.warnings > 0 && <>, <span className="import-warning-text">{preview.totals.warnings} with warnings</span></>}.
              {preview.blankRows > 0 && <span className="muted"> {preview.blankRows} blank {preview.blankRows === 1 ? 'row was' : 'rows were'} ignored.</span>}
            </p>
            <p className="muted small">
              Columns separated by {preview.separator}.{' '}
              {encodingIsUtf16 ? (
                <>Read as {preview.encodingLabel}.</>
              ) : (
                <label className="import-encoding">
                  Read as{' '}
                  <select value={encoding || preview.encoding} onChange={(e) => readFile(file, e.target.value)} disabled={Boolean(busy)}>
                    {ENCODING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {' '}· if letters like ā or é look wrong, try another.
                </label>
              )}
            </p>
            {preview.notes.map((n) => <p key={n} className="import-note">{n}</p>)}
          </div>

          <div className="toolbar import-toolbar">
            <label className="import-filter">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Show only rows with problems or warnings
            </label>
          </div>

          <div className={`table-wrap${busy ? ' is-loading' : ''}`} aria-busy={Boolean(busy)}>
            <table className="import-table">
              <thead>
                <tr><th className="num">Row</th><th>Title</th><th>Severity</th><th>Steps</th><th>Status</th><th>Check</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'import-row-error' : undefined}>
                    <td className="num muted">{r.row}</td>
                    <td className="title-cell" title={r.values.title.length > 120 ? r.values.title : undefined}>
                      {r.values.title ? shorten(r.values.title) : <span className="muted">(no title)</span>}
                    </td>
                    <td>{SEVERITY_NAMES.includes(r.values.severity) ? <SeverityBadge severity={r.values.severity} /> : <span className="muted">{r.values.severity || '—'}</span>}</td>
                    <td><StepsCell steps={r.values.steps} /></td>
                    <td>{r.values.status}</td>
                    <td><ProblemList errors={r.errors} warnings={r.warnings} /></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="empty">No rows with problems. Every row is ready to import.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="form-actions import-actions">
            <button type="button" className="button" onClick={startOver} disabled={Boolean(busy)}>Choose a different file</button>
            <button type="button" className="button button-primary" onClick={runImport} disabled={valid === 0 || Boolean(busy)}>
              {busy === 'importing' ? 'Importing…' : valid === 0 ? 'Nothing to import' : `Import ${valid} test ${valid === 1 ? 'case' : 'cases'}`}
            </button>
          </div>
          {valid === 0 && <p className="hint">Every row has a problem. Fix them in your spreadsheet, save it as CSV again, and choose the file again.</p>}
        </>
      )}
    </main>
  );
}
