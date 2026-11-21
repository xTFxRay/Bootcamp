#!/usr/bin/env bash
# PostToolUse hook: after a server JavaScript file is written or edited, check that its
# endpoints reply with the CLAUDE.md envelope { success, data, error }.
#
# Covers server/*.js (where the API files live today, e.g. server/bugs.js) and any folder
# under server/, including server/routes/. node_modules is skipped. Files with no replies
# in them (db.js, validation.js...) simply pass.
#
# It only WARNS: it never blocks or undoes the edit. Problems are shown to the user and passed
# back to Claude so they can be fixed. Files outside server/ are ignored.
#
# What counts as correct:
#   - ok(res, data) / fail(res, status, error) from server/api-response.js (always correct)
#   - res.json({ success, data, error }) with exactly those three fields
# What gets a warning:
#   - res.json({...}) missing one of the fields, or with extra top-level fields
#   - success: true with a non-null error, or success: false with non-null data
#   - res.json(someVariable): the shape can't be checked from the code
#   - res.send(), res.end(), res.sendStatus(): these don't send the JSON envelope

input="$(cat)"

file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
[ -n "$file" ] || exit 0

# Only JavaScript files under server/ (absolute or relative paths), never installed packages.
case "$file" in
  */node_modules/*) exit 0 ;;
esac
case "$file" in
  */server/*.js | */server/*.mjs | */server/*.cjs | \
  server/*.js | server/*.mjs | server/*.cjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

node - "$file" <<'NODE'
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');

// Blank out comments (keeping line breaks and string contents), so commented-out code isn't checked.
function stripComments(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j;
    } else if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') { out += ' '; i++; }
      out += s[i] ?? '';
    } else if (c === '/' && n === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2;
      out += s.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
    } else {
      out += c;
    }
  }
  return out;
}

// From an opening "(" return the text up to its matching ")", skipping strings.
function argumentAt(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      i = j;
    } else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return null;
}

// Top-level "key: value" pairs of an object literal's text (including shorthand { success }).
function topLevelFields(objText) {
  const inner = objText.trim().slice(1, -1);
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < inner.length && inner[j] !== c) j += inner[j] === '\\' ? 2 : 1;
      i = j;
    } else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(inner.slice(start, i)); start = i + 1; }
  }
  parts.push(inner.slice(start));
  const fields = {};
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    if (raw.startsWith('...')) { fields['...spread'] = raw; continue; }
    const m = raw.match(/^["']?([A-Za-z_$][\w$]*)["']?\s*(?::\s*([\s\S]*))?$/);
    if (m) fields[m[1]] = m[2] === undefined ? m[1] : m[2].trim();
  }
  return fields;
}

const code = stripComments(src);
const lineOf = (index) => code.slice(0, index).split('\n').length;
const warnings = [];
const call = /\b(res|response)\s*(?:\.\s*status\s*\([^)]*\)\s*)?\.\s*(json|jsonp|send|end|sendStatus)\s*\(/g;

let m;
while ((m = call.exec(code))) {
  const line = lineOf(m.index);
  const method = m[2];
  if (method !== 'json' && method !== 'jsonp') {
    warnings.push(`line ${line}: res.${method}() doesn't send the { success, data, error } envelope. Use ok()/fail() from api-response.js, or res.json({ success, data, error }).`);
    continue;
  }
  const arg = argumentAt(code, m.index + m[0].length - 1);
  if (arg === null) continue;
  const text = arg.trim();
  if (!text.startsWith('{')) {
    warnings.push(`line ${line}: res.${method}(${text.slice(0, 40)}${text.length > 40 ? '…' : ''}) passes a value whose shape can't be checked. Build the envelope in place, or use ok()/fail().`);
    continue;
  }
  const fields = topLevelFields(text);
  const missing = ['success', 'data', 'error'].filter((k) => !(k in fields));
  const extra = Object.keys(fields).filter((k) => !['success', 'data', 'error'].includes(k));
  if (missing.length) warnings.push(`line ${line}: res.${method}() is missing ${missing.join(', ')}. Every reply needs { success, data, error }.`);
  if (extra.length) warnings.push(`line ${line}: res.${method}() has extra top-level field(s) ${extra.join(', ')}. Put them inside data.`);
  if (fields.success === 'true' && 'error' in fields && fields.error !== 'null') {
    warnings.push(`line ${line}: success is true but error isn't null.`);
  }
  if (fields.success === 'false' && 'data' in fields && fields.data !== 'null') {
    warnings.push(`line ${line}: success is false but data isn't null.`);
  }
}

if (warnings.length === 0) process.exit(0);

const name = path.relative(process.cwd(), file) || file;
const message =
  `⚠ Response shape check (warning only): ${name} has ${warnings.length} endpoint reply ` +
  `issue${warnings.length > 1 ? 's' : ''} against the CLAUDE.md envelope { success, data, error }:\n` +
  warnings.map((w) => `  - ${w}`).join('\n');

process.stdout.write(JSON.stringify({
  systemMessage: message,
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
}));
NODE
exit 0
