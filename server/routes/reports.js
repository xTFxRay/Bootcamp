import { Router } from 'express';
import db from '../db.js';
import { ok, fail } from '../api-response.js';
import { toId } from '../validation.js';
import { createReportFromRun } from '../report-snapshot.js';

// Test report endpoints, mounted at /api/reports.
// Every reply uses { success, data, error } (see CLAUDE.md), except the HTML export,
// which is a file download: it sends the file on success and the envelope on errors.
const router = Router();

const PAGE_SIZE = 20;

function toReport(row, { withResults = true } = {}) {
  const report = {
    id: row.id,
    runId: row.run_id,
    suiteName: row.suite_name,
    runDate: row.run_date,
    runStatus: row.run_status,
    totalCount: row.total_count,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    notRunCount: row.total_count - row.passed_count - row.failed_count - row.skipped_count,
    generatedAt: row.generated_at,
  };
  if (withResults) report.results = JSON.parse(row.results);
  return report;
}

function findRow(id) {
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
}

// GET /api/reports?runId=&page=
function handleListReports(req, res) {
  const { runId, page: pageParam } = req.query;
  for (const [key, value] of Object.entries({ runId, page: pageParam })) {
    if (value !== undefined && typeof value !== 'string') return fail(res, 400, `Only one "${key}" value is allowed`);
  }
  if (runId !== undefined && !toId(runId)) return fail(res, 400, 'runId must be a test run ID number');
  const page = pageParam === undefined ? 1 : toId(pageParam);
  if (!page) return fail(res, 400, 'Page must be a whole number, 1 or more');

  const where = runId ? 'WHERE run_id = @runId' : '';
  const params = runId ? { runId: toId(runId) } : {};
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM reports ${where}`).get(params);
  const rows = db
    .prepare(`SELECT * FROM reports ${where} ORDER BY generated_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  ok(res, {
    items: rows.map((r) => toReport(r, { withResults: false })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

// GET /api/reports/:id
function handleGetReport(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Report not found');
  ok(res, toReport(row));
}

// POST /api/reports  { runId }  -> snapshot of that test run's results right now
function handleCreateReport(req, res) {
  const runId = toId(req.body?.runId);
  if (!runId) return fail(res, 400, 'runId must be a test run ID number');
  const id = createReportFromRun(db, runId);
  if (!id) return fail(res, 404, 'Test run not found');
  ok(res, toReport(findRow(id)), 201);
}

// --- HTML export ----------------------------------------------------------

// Escapes text for HTML, so titles and notes can never add markup or scripts to the file.
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const formatDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

function formatDuration(ms) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// One-line verdict for the top of the report, in plain words.
function verdict(report) {
  if (report.notRunCount) {
    const failed = report.failedCount ? ` ${report.failedCount} failed so far.` : '';
    return { tone: 'progress', label: 'Incomplete', text: `${report.notRunCount} of ${report.totalCount} cases had no result when this report was generated.${failed}` };
  }
  if (report.failedCount) return { tone: 'failed', label: 'Failed', text: `${report.failedCount} of ${report.totalCount} ${report.totalCount === 1 ? 'case' : 'cases'} failed. See the notes below for what went wrong.` };
  if (!report.totalCount) return { tone: 'neutral', label: 'Empty', text: 'This run had no test cases.' };
  return { tone: 'passed', label: 'Passed', text: report.skippedCount ? `Every case that ran passed. ${report.skippedCount} skipped.` : 'Every case passed.' };
}

const RESULT_ICONS = { passed: '✓', failed: '✕', skipped: '–', 'not run': '○' };
const RESULT_LABELS = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', 'not run': 'Not run' };
const RUN_STATUS_LABELS = { passed: 'Passed', failed: 'Failed', 'in-progress': 'In progress' };

// A complete, self-contained page: inline CSS only, no scripts, no fonts or images from elsewhere.
function renderReportHtml(report) {
  const decided = report.passedCount + report.failedCount;
  const passRate = decided ? `${Math.round((report.passedCount / decided) * 1000) / 10}%` : '—';
  const totalMs = report.results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
  const v = verdict(report);
  const t = report.totalCount;

  const card = (kind, label, value, sub) => `
      <div class="card card-${kind}">
        <div class="card-label">${label}</div>
        <div class="card-value">${esc(value)}</div>
        <div class="card-sub">${sub}</div>
      </div>`;

  const bar = t
    ? `<div class="bar" role="img" aria-label="${esc(`${report.passedCount} passed, ${report.failedCount} failed, ${report.skippedCount} skipped, ${report.notRunCount} not run`)}">
        ${[['passed', report.passedCount], ['failed', report.failedCount], ['skipped', report.skippedCount], ['notrun', report.notRunCount]]
          .filter(([, n]) => n)
          .map(([k, n]) => `<span class="bar-${k}" style="width:${(n / t) * 100}%"></span>`)
          .join('')}
      </div>`
    : '';

  const rows = report.results
    .map((r) => {
      const kind = r.result.replace(' ', '-');
      return `
        <tr class="row-${kind}">
          <td class="c-num">${esc(r.position)}</td>
          <td class="c-title">${esc(r.title)}${r.testCaseId ? `<div class="case-id">TC-${esc(r.testCaseId)}</div>` : ''}</td>
          <td><span class="sev sev-${esc(r.severity.toLowerCase())}">${esc(r.severity)}</span></td>
          <td><span class="badge badge-${esc(kind)}"><span class="badge-icon" aria-hidden="true">${RESULT_ICONS[r.result] ?? ''}</span>${esc(RESULT_LABELS[r.result] ?? r.result)}</span></td>
          <td class="c-time">${esc(formatDuration(r.durationMs)) || '<span class="dim">—</span>'}</td>
          <td class="c-notes">${r.notes ? esc(r.notes) : '<span class="dim">—</span>'}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.suiteName)} — Test report #${esc(report.id)}</title>
<style>
  :root {
    color-scheme: light;
    --ink: #111827; --ink-2: #374151; --muted: #6b7280; --line: #e5e7eb; --line-2: #d1d5db; --paper: #ffffff; --wash: #f9fafb;
    --brand: #1e3a8a; --brand-2: #3b82f6;
    --pass: #15803d; --pass-bg: #ecfdf3; --pass-line: #86efac;
    --fail: #b91c1c; --fail-bg: #fef2f2; --fail-line: #fca5a5;
    --skip: #4b5563; --skip-bg: #f3f4f6; --skip-line: #d1d5db;
    --prog: #b45309; --prog-bg: #fffbeb; --prog-line: #fcd34d;
  }
  * { box-sizing: border-box; }
  html { background: #eef1f5; }
  body { margin: 0; padding: 40px 24px; font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; }
  .sheet { max-width: 980px; margin: 0 auto; background: var(--paper); border-radius: 14px; box-shadow: 0 1px 2px rgba(17,24,39,.06), 0 8px 28px rgba(17,24,39,.08); overflow: hidden; }

  /* Header */
  .masthead { padding: 28px 36px 24px; border-top: 6px solid var(--brand); border-bottom: 1px solid var(--line); }
  .eyebrow { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--brand); }
  .eyebrow .doc-id { color: var(--muted); font-weight: 500; letter-spacing: .04em; }
  .title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-top: 10px; }
  h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.01em; }
  .subtitle { margin-top: 4px; color: var(--muted); font-size: 15px; }
  .verdict { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; letter-spacing: .03em; text-transform: uppercase; border: 1px solid; }
  .verdict::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .tone-passed { color: var(--pass); background: var(--pass-bg); border-color: var(--pass-line); }
  .tone-failed { color: var(--fail); background: var(--fail-bg); border-color: var(--fail-line); }
  .tone-progress { color: var(--prog); background: var(--prog-bg); border-color: var(--prog-line); }
  .tone-neutral { color: var(--skip); background: var(--skip-bg); border-color: var(--skip-line); }
  .meta { display: grid; grid-template-columns: repeat(4, auto); justify-content: start; gap: 4px 40px; margin: 20px 0 0; }
  .meta dt { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .meta dd { margin: 2px 0 0; font-weight: 500; }

  /* Summary */
  .summary { padding: 28px 36px 8px; }
  .verdict-text { margin: 0 0 18px; font-size: 15px; color: var(--ink-2); }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .card { padding: 14px 16px 12px; border: 1px solid var(--line); border-top-width: 4px; border-radius: 10px; background: var(--paper); }
  .card-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .card-value { margin-top: 2px; font-size: 32px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .card-sub { font-size: 12px; color: var(--muted); }
  .card-total { border-top-color: var(--brand); }
  .card-passed { border-top-color: #22c55e; background: var(--pass-bg); } .card-passed .card-value { color: var(--pass); }
  .card-failed { border-top-color: #ef4444; background: var(--fail-bg); } .card-failed .card-value { color: var(--fail); }
  .card-skipped { border-top-color: #9ca3af; background: var(--skip-bg); } .card-skipped .card-value { color: var(--skip); }
  .card-rate { border-top-color: var(--brand-2); }
  .bar { display: flex; height: 10px; margin: 18px 0 6px; border-radius: 999px; overflow: hidden; background: var(--line); }
  .bar span { display: block; height: 100%; }
  .bar-passed { background: #22c55e; } .bar-failed { background: #ef4444; } .bar-skipped { background: #9ca3af; } .bar-notrun { background: #fcd34d; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; color: var(--muted); }
  .legend i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border-radius: 2px; vertical-align: 0; }

  /* Results table */
  .results { padding: 24px 36px 8px; }
  h2 { margin: 0 0 12px; font-size: 16px; }
  h2 .count { color: var(--muted); font-weight: 500; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; vertical-align: top; padding: 11px 12px; border-bottom: 1px solid var(--line); }
  tbody tr:last-child td { border-bottom: 0; }
  th { background: var(--wash); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  tbody tr:nth-child(even) td { background: #fcfcfd; }
  tr.row-failed td { background: var(--fail-bg) !important; }
  tr.row-failed td:first-child { border-left: 3px solid #ef4444; padding-left: 9px; }
  .c-num { width: 44px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .c-time { width: 70px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ink-2); }
  th.c-time { text-align: right; }
  col.w-title { width: 32%; } col.w-sev { width: 96px; } col.w-res { width: 108px; }
  .c-title { font-weight: 500; overflow-wrap: anywhere; }
  .case-id { margin-top: 2px; font-size: 11px; font-weight: 400; color: var(--muted); }
  .c-notes { color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
  tr.row-failed .c-notes { color: #7f1d1d; }
  .dim { color: #c0c4cc; }
  .sev, .badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; }
  .sev-critical { background: #fee2e2; color: #991b1b; } .sev-major { background: #ffedd5; color: #9a3412; }
  .sev-minor { background: #fef9c3; color: #854d0e; } .sev-trivial { background: #f3f4f6; color: #374151; }
  .badge-icon { font-weight: 700; }
  .badge-passed { background: var(--pass-bg); color: var(--pass); border-color: var(--pass-line); }
  .badge-failed { background: #fee2e2; color: var(--fail); border-color: var(--fail-line); }
  .badge-skipped { background: var(--skip-bg); color: var(--skip); border-color: var(--skip-line); }
  .badge-not-run { background: var(--prog-bg); color: var(--prog); border-color: var(--prog-line); }

  /* Footer */
  footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 24px; padding: 18px 36px 24px; border-top: 1px solid var(--line); background: var(--wash); font-size: 12px; color: var(--muted); }
  footer strong { color: var(--ink-2); font-weight: 600; }
  footer p { margin: 0; }
  footer p:last-child { flex: none; text-align: right; }

  @media (max-width: 720px) {
    body { padding: 0; } .sheet { border-radius: 0; }
    .masthead, .summary, .results, footer { padding-left: 18px; padding-right: 18px; }
    .title-row, footer { flex-direction: column; gap: 10px; }
    .meta { grid-template-columns: repeat(2, auto); }
    .cards { grid-template-columns: repeat(2, 1fr); }
    table { table-layout: auto; }
  }

  /* Paper: A4, no page background or shadows, colours kept, rows never split across pages. */
  @page { size: A4; margin: 14mm 12mm 16mm; }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; font-size: 9pt; line-height: 1.45; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; border-radius: 0; box-shadow: none; overflow: visible; }
    .masthead { padding: 0 0 14px; border-top: 0; border-bottom: 2px solid var(--brand); }
    .summary, .results { padding: 14px 0 0; }
    .verdict-text { margin-bottom: 12px; }
    .card { padding: 9px 12px 8px; }
    .bar { margin-top: 12px; }
    th, td { padding: 7px 9px; }
    tr.row-failed td:first-child { padding-left: 6px; }
    footer { padding: 10px 0 0; margin-top: 14px; background: none; font-size: 8pt; break-inside: avoid; page-break-inside: avoid; }
    h1 { font-size: 18pt; }
    .card-value { font-size: 18pt; }
    .title-row, footer { flex-direction: row; }
    .cards { grid-template-columns: repeat(5, 1fr); }
    table { table-layout: fixed; border: 0; border-radius: 0; overflow: visible; }
    th { border-top: 1px solid var(--line); }
    tbody tr:last-child td { border-bottom: 1px solid var(--line); }
    thead { display: table-header-group; }
    tr, .card, .summary { break-inside: avoid; page-break-inside: avoid; }
    .masthead, h2 { break-after: avoid; page-break-after: avoid; }
    tbody tr:nth-child(even) td { background: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header class="masthead">
    <div class="eyebrow"><span>Bootcamp App · Test report</span><span class="doc-id">Report #${esc(report.id)}</span></div>
    <div class="title-row">
      <div>
        <h1>${esc(report.suiteName)}</h1>
        <div class="subtitle">Test run on ${esc(formatDay(report.runDate))}</div>
      </div>
      <span class="verdict tone-${v.tone}">${esc(v.label)}</span>
    </div>
    <dl class="meta">
      <div><dt>Test run</dt><dd>${report.runId ? `#${esc(report.runId)}` : 'Deleted'}</dd></div>
      <div><dt>Started</dt><dd>${esc(formatDateTime(report.runDate))}</dd></div>
      <div><dt>Run status</dt><dd>${esc(RUN_STATUS_LABELS[report.runStatus] ?? report.runStatus)}</dd></div>
      <div><dt>Time spent</dt><dd>${esc(formatDuration(totalMs) || '0s')}</dd></div>
    </dl>
  </header>

  <section class="summary" aria-label="Summary">
    <p class="verdict-text">${esc(v.text)}</p>
    <div class="cards">${card('total', 'Total', t, `${t === 1 ? 'test case' : 'test cases'}`)}${card('passed', 'Passed', report.passedCount, `${pct(report.passedCount, t)}% of total`)}${card('failed', 'Failed', report.failedCount, `${pct(report.failedCount, t)}% of total`)}${card('skipped', 'Skipped', report.skippedCount, `${pct(report.skippedCount, t)}% of total`)}${card('rate', 'Pass rate', passRate, decided ? `of ${decided} that ran` : 'nothing ran')}
    </div>
    ${bar}
    ${t ? `<div class="legend"><span><i style="background:#22c55e"></i>Passed</span><span><i style="background:#ef4444"></i>Failed</span><span><i style="background:#9ca3af"></i>Skipped</span>${report.notRunCount ? '<span><i style="background:#fcd34d"></i>Not run</span>' : ''}</div>` : ''}
  </section>

  <section class="results">
    <h2>Results <span class="count">· ${esc(t)} ${t === 1 ? 'case' : 'cases'}, in run order</span></h2>
    <table>
      <colgroup><col style="width:44px"><col class="w-title"><col class="w-sev"><col class="w-res"><col style="width:70px"><col></colgroup>
      <thead>
        <tr><th class="c-num">#</th><th>Test case</th><th>Severity</th><th>Result</th><th class="c-time">Time</th><th>Notes</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6">This run had no test cases.</td></tr>'}
      </tbody>
    </table>
  </section>

  <footer>
    <p><strong>Generated ${esc(formatDateTime(report.generatedAt))}</strong> by Bootcamp App<br>A snapshot of test run ${report.runId ? `#${esc(report.runId)}` : '(deleted)'} at that moment; later changes to the run aren't included.</p>
    <p>Pass rate = passed ÷ (passed + failed).<br>Skipped and not-run cases are left out.</p>
  </footer>
</div>
</body>
</html>
`;
}

// GET /api/reports/:id/export/html -> downloads the report as one self-contained HTML file
function handleExportReportHtml(req, res) {
  const row = findRow(req.params.id);
  if (!row) return fail(res, 404, 'Report not found');
  const report = toReport(row);
  const filename = `test-report-${report.id}-${slug(report.suiteName)}-${report.runDate.slice(0, 10)}.html`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(renderReportHtml(report)); // response-shape: file-download (documented exception in CLAUDE.md)
}

// Only whole-number IDs reach the handlers; anything else, like "1.0" or "abc", is not found.
router.param('id', (req, res, next, id) => (toId(id) ? next() : fail(res, 404, 'Report not found')));

router.get('/', handleListReports);
router.get('/:id', handleGetReport);
router.post('/', handleCreateReport);
router.get('/:id/export/html', handleExportReportHtml);

export default router;
