import { parse } from 'csv-parse/sync';
import { SEVERITIES, TEST_CASE_STATUSES } from './db.js';

// Reads an uploaded CSV file of test cases and checks every row, without saving anything.
// Used by POST /api/test-cases/import/preview and POST /api/test-cases/import (see test-cases.js).

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 1000;
export const ENCODINGS = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16', 'utf-16be': 'UTF-16', 'windows-1257': 'Windows-1257 (Baltic)', 'windows-1252': 'Windows-1252 (Western)' };
export const CHOOSABLE_ENCODINGS = ['utf-8', 'windows-1257', 'windows-1252'];

// The fields a column can fill, with the header names that mean it. Header names are compared
// after lower-casing and removing spaces, "_" and "-", so "Expected result" = "expected_result".
const FIELDS = [
  { key: 'title', label: 'title', names: ['title'], required: true },
  { key: 'severity', label: 'severity', names: ['severity'], required: true },
  { key: 'steps', label: 'steps', names: ['steps'], required: true },
  { key: 'expectedResult', label: 'expected result', names: ['expectedresult', 'expected'], required: true },
  { key: 'preconditions', label: 'preconditions', names: ['preconditions'], required: false },
  { key: 'status', label: 'status', names: ['status'], required: false },
];
const SEPARATORS = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

const normalizeHeader = (h) => h.toLowerCase().replace(/[\s_-]+/g, '');
const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);

// Bytes -> text. `chosen` is an encoding the person picked in the preview, or undefined to detect it.
function decode(buf, chosen) {
  if (buf.length === 0) return { error: 'The file is empty.' };
  // .xlsx files are zip archives ("PK"); old .xls files start with D0 CF 11 E0.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) {
    return { error: 'This is an Excel file, not a CSV file. In Excel choose File → Save As → “CSV UTF-8”, then upload that file.' };
  }

  let encoding = chosen;
  let note = null;
  let bytes = buf;
  if (!encoding) {
    if (startsWith(buf, [0xef, 0xbb, 0xbf])) encoding = 'utf-8';
    else if (startsWith(buf, [0xff, 0xfe])) encoding = 'utf-16le';
    else if (startsWith(buf, [0xfe, 0xff])) encoding = 'utf-16be';
    else {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
        encoding = 'utf-8';
      } catch {
        // Not valid UTF-8: most likely saved by Excel on a Baltic-language Windows PC.
        encoding = 'windows-1257';
        note = "The file isn't UTF-8, so it was read as Windows-1257 (Baltic). If letters look wrong, pick another encoding.";
      }
    }
  }
  // TextDecoder drops a byte-order mark at the start by itself.
  let text = new TextDecoder(encoding).decode(bytes);
  if (text.includes('\u0000')) return { error: "This isn't a text file. Upload a CSV file saved from a spreadsheet." };
  text = text.replace(/\r\n?/g, '\n'); // Windows and old Mac line endings -> "\n"
  return { text, encoding, note };
}

// The separator that appears most often in the header line, outside quotes. Comma when there's a tie or none.
function detectSeparator(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '\n' && !quoted) break;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  return Object.entries(counts).reduce((best, [sep, n]) => (n > counts[best] ? sep : best), ',');
}

// One cell of steps -> a list. Steps go on separate lines in the cell, or are separated by "|" on one line.
// Numbering or bullets at the start ("1.", "2)", "-", "•") are removed: the app numbers steps itself.
export function splitSteps(cell) {
  const lines = cell.includes('\n') ? cell.split('\n') : cell.split('|');
  return lines.map((s) => s.trim().replace(/^(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
}

const matchIgnoringCase = (value, allowed) => allowed.find((a) => a.toLowerCase() === value.toLowerCase());

// Reads and checks the whole file. Returns { error } when the file as a whole can't be used,
// otherwise the preview: settings it detected, notes, and every row with its problems.
// `checkRow(body)` is the same check the test case form uses; it returns the list of problems.
export function analyzeCsv(buf, chosenEncoding, { checkRow, existingTitles }) {
  const decoded = decode(buf, chosenEncoding);
  if (decoded.error) return { error: decoded.error };
  const { text, encoding } = decoded;
  const notes = decoded.note ? [decoded.note] : [];

  const separator = detectSeparator(text);
  let records;
  try {
    // relax_quotes: a quote inside an unquoted cell (Type "log" here) is kept as text, as Excel does.
    records = parse(text, { delimiter: separator, relax_column_count: true, relax_quotes: true, skip_empty_lines: false });
  } catch (err) {
    const where = err.lines ? ` on line ${err.lines}` : '';
    const what =
      err.code === 'CSV_QUOTE_NOT_CLOSED'
        ? 'a quote (") is opened but never closed'
        : err.code === 'CSV_INVALID_CLOSING_QUOTE'
          ? 'there is text right after a closing quote (")'
          : 'the file is not valid CSV';
    return { error: `The file couldn't be read${where}: ${what}. Fix it in your spreadsheet and save it as CSV again.` };
  }

  const isBlank = (record) => record.every((cell) => cell.trim() === '');
  const headerIndex = records.findIndex((r) => !isBlank(r));
  if (headerIndex === -1) return { error: 'The file is empty.' };
  const headers = records[headerIndex].map((h) => h.trim());

  // Header row -> which column holds which field.
  const columnOf = {};
  const ignored = [];
  for (const [i, header] of headers.entries()) {
    const field = FIELDS.find((f) => f.names.includes(normalizeHeader(header)));
    if (!field) {
      if (header) ignored.push(header);
      continue;
    }
    if (field.key in columnOf) {
      return { error: `The column “${field.label}” appears twice (“${headers[columnOf[field.key]]}” and “${header}”). Keep one and upload again.` };
    }
    columnOf[field.key] = i;
  }
  const missing = FIELDS.filter((f) => f.required && !(f.key in columnOf)).map((f) => `“${f.label}”`);
  if (missing.length) {
    const found = headers.filter(Boolean).map((h) => `“${h}”`).join(', ') || 'none';
    return {
      error: `The file is missing the ${missing.length === 1 ? 'column' : 'columns'} ${missing.join(', ')}. The first row must name the columns: title, severity, steps, expected result (and optionally preconditions, status). Columns found: ${found}.`,
    };
  }
  if (ignored.length) notes.push(`These columns aren't used and were ignored: ${ignored.map((h) => `“${h}”`).join(', ')}.`);

  const dataRecords = records.slice(headerIndex + 1).map((record, i) => ({ record, row: headerIndex + 2 + i }));
  const blankRows = dataRecords.filter(({ record }) => isBlank(record)).length;
  const filled = dataRecords.filter(({ record }) => !isBlank(record));
  if (filled.length === 0) return { error: 'The file has a header row but no test cases under it.' };
  if (filled.length > MAX_ROWS) {
    return { error: `The file has ${filled.length} test cases; the limit is ${MAX_ROWS} per file. Split it into smaller files.` };
  }

  const titleKey = (t) => t.trim().toLowerCase();
  const seenInFile = new Map(); // title -> first row number
  const rows = filled.map(({ record, row }) => {
    const cell = (key) => (key in columnOf ? (record[columnOf[key]] ?? '') : '');
    const rawSeverity = cell('severity').trim();
    const rawStatus = cell('status').trim();
    const body = {
      title: cell('title'),
      severity: matchIgnoringCase(rawSeverity, SEVERITIES) ?? rawSeverity,
      steps: splitSteps(cell('steps')),
      expectedResult: cell('expectedResult'),
      preconditions: cell('preconditions'),
      status: rawStatus ? (matchIgnoringCase(rawStatus, TEST_CASE_STATUSES) ?? rawStatus) : 'draft',
    };

    // Same rules as the form, with clearer wording where the value came from a cell.
    const errors = checkRow(body).map((message) => {
      if (message.startsWith('Severity') && rawSeverity) return `Severity “${rawSeverity}” isn't one of: ${SEVERITIES.join(', ')}`;
      if (message.startsWith('Severity')) return `Severity is required (${SEVERITIES.join(', ')})`;
      if (message.startsWith('Status')) return `Status “${rawStatus}” isn't one of: ${TEST_CASE_STATUSES.join(', ')}`;
      return message;
    });
    if (record.length > headers.length && record.slice(headers.length).some((c) => c.trim())) {
      errors.push(
        `This row has ${record.length} cells but the header has ${headers.length}. A cell probably contains a ${SEPARATORS[separator]} without quotes around it.`
      );
    }

    const warnings = [];
    const key = titleKey(body.title);
    if (key) {
      if (existingTitles.has(key)) warnings.push('A test case with this title already exists. It will be added as another one.');
      if (seenInFile.has(key)) warnings.push(`Same title as row ${seenInFile.get(key)}.`);
      else seenInFile.set(key, row);
    }

    return {
      row,
      values: {
        title: body.title.trim(),
        severity: body.severity,
        status: body.status,
        steps: body.steps,
        expectedResult: body.expectedResult.trim(),
        preconditions: body.preconditions.trim(),
      },
      cells: record, // the original cells, for "Download skipped rows"
      errors,
      warnings,
      body,
    };
  });

  const valid = rows.filter((r) => r.errors.length === 0).length;
  return {
    encoding,
    encodingLabel: ENCODINGS[encoding],
    separator: SEPARATORS[separator],
    headers,
    notes,
    blankRows,
    totals: { rows: rows.length, valid, invalid: rows.length - valid, warnings: rows.filter((r) => r.warnings.length).length },
    rows,
  };
}
