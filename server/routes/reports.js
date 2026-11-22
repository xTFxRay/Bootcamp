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

function formatDuration(ms) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
}

// A complete, self-contained page: inline CSS only, no scripts, no external files.
function renderReportHtml(report) {
  const decided = report.passedCount + report.failedCount;
  const passRate = decided ? `${Math.round((report.passedCount / decided) * 1000) / 10}%` : '—';
  const rows = report.results
    .map(
      (r) => `
        <tr>
          <td class="num">${esc(r.position)}</td>
          <td>${esc(r.title)}</td>
          <td><span class="sev sev-${esc(r.severity.toLowerCase())}">${esc(r.severity)}</span></td>
          <td><span class="res res-${esc(r.result.replace(' ', '-'))}">${esc(r.result)}</span></td>
          <td class="num">${esc(formatDuration(r.durationMs))}</td>
          <td class="notes">${esc(r.notes)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test report #${esc(report.id)}: ${esc(report.suiteName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background: #fff; }
  .page { max-width: 960px; margin: 0 auto; }
  header { border-bottom: 2px solid #1f2937; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .meta { color: #4b5563; font-size: 13px; }
  .meta span + span::before { content: " · "; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 0 0 24px; }
  .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; }
  .box .label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .box .value { font-size: 22px; font-weight: 700; }
  .passed .value { color: #15803d; } .failed .value { color: #b91c1c; } .skipped .value { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; border-bottom: 2px solid #d1d5db; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.notes { color: #374151; white-space: pre-wrap; }
  .sev, .res { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .sev-critical { background: #fee2e2; color: #991b1b; } .sev-major { background: #ffedd5; color: #9a3412; }
  .sev-minor { background: #fef9c3; color: #854d0e; } .sev-trivial { background: #f3f4f6; color: #374151; }
  .res-passed { background: #dcfce7; color: #166534; } .res-failed { background: #fee2e2; color: #991b1b; }
  .res-skipped, .res-not-run { background: #f3f4f6; color: #4b5563; }
  footer { margin-top: 24px; color: #6b7280; font-size: 12px; }
  .note { background: #fef9c3; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; }
  @media (max-width: 640px) { body { padding: 16px; } .summary { grid-template-columns: repeat(2, 1fr); } }
  @page { size: A4; margin: 16mm 14mm; }
  @media print {
    body { padding: 0; font-size: 11pt; }
    .page { max-width: none; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .summary { grid-template-columns: repeat(5, 1fr); }
    .box, tr { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    h1, header { break-after: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>Test report: ${esc(report.suiteName)}</h1>
    <div class="meta">
      <span>Report #${esc(report.id)}</span>
      ${report.runId ? `<span>Test run #${esc(report.runId)}</span>` : '<span>Test run deleted</span>'}
      <span>Run started ${esc(formatDateTime(report.runDate))}</span>
      <span>Run status: ${esc(report.runStatus)}</span>
      <span>Generated ${esc(formatDateTime(report.generatedAt))}</span>
    </div>
  </header>
  ${report.notRunCount ? `<p class="note">This run wasn't finished when the report was generated: ${esc(report.notRunCount)} of ${esc(report.totalCount)} cases had no result yet.</p>` : ''}
  <section class="summary" aria-label="Summary">
    <div class="box"><div class="label">Total</div><div class="value">${esc(report.totalCount)}</div></div>
    <div class="box passed"><div class="label">Passed</div><div class="value">${esc(report.passedCount)}</div></div>
    <div class="box failed"><div class="label">Failed</div><div class="value">${esc(report.failedCount)}</div></div>
    <div class="box skipped"><div class="label">Skipped</div><div class="value">${esc(report.skippedCount)}</div></div>
    <div class="box"><div class="label">Pass rate</div><div class="value">${esc(passRate)}</div></div>
  </section>
  <table>
    <thead>
      <tr><th class="num">#</th><th>Test case</th><th>Severity</th><th>Result</th><th class="num">Time</th><th>Notes</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">This run had no test cases.</td></tr>'}
    </tbody>
  </table>
  <footer>Pass rate counts passed and failed cases only; skipped and not-run cases are left out. Generated by Bootcamp App.</footer>
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
