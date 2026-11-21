#!/usr/bin/env bash
# PostToolUse hook: after a JavaScript, TypeScript or React file is written or edited, look
# through the NEW content for severity values that don't match CLAUDE.md:
#   Critical / Major / Minor / Trivial  (exactly these, capitalized)
#
# It warns about common wrong words used as a severity (high, medium, low, blocker, cosmetic,
# and a few similar) and about the right words in the wrong case ('major' instead of 'Major').
# It only WARNS: it never blocks or undoes the edit.
#
# Only severity contexts are checked, because "high" / "medium" / "low" are the correct values
# for a bug's PRIORITY in this app. A word is flagged when it is:
#   - the value of a severity field:      severity: 'high'   severity = "low"   severity="high"
#   - compared with a severity:           severity === 'low'   'high' !== bug.severity
#   - in a list of severities:            const SEVERITIES = ['High', ...]
#   - checked against severities:         SEVERITIES.includes('blocker')
# The new content is the whole file for Write, new_string for Edit, and every new_string for
# MultiEdit.

input="$(cat)"

file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
[ -n "$file" ] || exit 0

case "$file" in
  */node_modules/*) exit 0 ;;
esac
case "$file" in
  *.js | *.jsx | *.ts | *.tsx | *.mjs | *.cjs) ;;
  *) exit 0 ;;
esac

HOOK_INPUT="$input" node - <<'NODE'
const fs = require('fs');
const path = require('path');

let hook;
try {
  hook = JSON.parse(process.env.HOOK_INPUT);
} catch {
  process.exit(0);
}
const t = hook.tool_input || {};
const file = t.file_path || (hook.tool_response || {}).filePath;

// The new content only.
const pieces = [];
if (typeof t.content === 'string') pieces.push(t.content);
if (typeof t.new_string === 'string') pieces.push(t.new_string);
if (Array.isArray(t.edits)) for (const e of t.edits) if (typeof e.new_string === 'string') pieces.push(e.new_string);
if (pieces.length === 0) process.exit(0);

const VALID = ['Critical', 'Major', 'Minor', 'Trivial'];
// Wrong word -> what to use instead.
const WRONG = {
  high: 'Critical or Major',
  highest: 'Critical',
  medium: 'Major or Minor',
  med: 'Major or Minor',
  low: 'Minor or Trivial',
  lowest: 'Trivial',
  blocker: 'Critical',
  cosmetic: 'Trivial',
  severe: 'Critical or Major',
  normal: 'Minor',
  moderate: 'Minor',
  urgent: 'Critical',
  showstopper: 'Critical',
  'show-stopper': 'Critical',
};
const escape = (s) => s.replace(/[-]/g, '\\-');
const words = [...Object.keys(WRONG), ...VALID].map((w) => escape(w.toLowerCase())).join('|');
const quote = '["\'`]';
const value = `${quote}(${words})${quote}`;

const patterns = [
  // severity: 'high'   severity = 'high'   severity === 'high'   severity="high"
  new RegExp(`\\bseverit(?:y|ies)\\s*(?:[:=]|===?|!==?)\\s*${value}`, 'gi'),
  // 'high' === bug.severity
  new RegExp(`${value}\\s*(?:===?|!==?)\\s*[\\w.$\\[\\]'"]*severit(?:y|ies)\\b`, 'gi'),
  // SEVERITIES.includes('high')
  new RegExp(`\\bseverit(?:y|ies)\\w*\\s*\\.\\s*(?:includes|indexOf)\\s*\\(\\s*${value}`, 'gi'),
];
// const SEVERITIES = [ ... ]
const listDecl = /\bseverit(?:y|ies)\w*\s*(?::[^=]*)?=\s*\[([^\]]*)\]/gi;

// Where each piece sits in the saved file, so warnings can give real line numbers.
let saved = '';
try {
  saved = fs.readFileSync(file, 'utf8');
} catch {}
const lineInFile = (piece, offset) => {
  const at = saved.indexOf(piece);
  return at === -1 ? null : saved.slice(0, at + offset).split('\n').length;
};

const warnings = [];
const seen = new Set();
const report = (piece, offset, word) => {
  const line = lineInFile(piece, offset);
  const where = line ? `line ${line}` : 'in the new text';
  const key = `${where}|${word}`;
  if (seen.has(key)) return;
  seen.add(key);
  const valid = VALID.find((v) => v.toLowerCase() === word.toLowerCase());
  const sortKey = line ?? Infinity;
  if (valid) {
    if (word !== valid) {
      warnings.push({ sortKey, text: `${where}: "${word}" should be written "${valid}" (severities are capitalized).` });
    }
    return;
  }
  warnings.push({
    sortKey,
    text: `${where}: "${word}" isn't a severity. Use ${WRONG[word.toLowerCase()]} (allowed: ${VALID.join(', ')}).`,
  });
};

for (const piece of pieces) {
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(piece))) report(piece, m.index, m[1]);
  }
  listDecl.lastIndex = 0;
  let d;
  while ((d = listDecl.exec(piece))) {
    const inner = new RegExp(value, 'gi');
    let w;
    while ((w = inner.exec(d[1]))) report(piece, d.index, w[1]);
  }
}

if (warnings.length === 0) process.exit(0);

const name = path.relative(process.cwd(), file) || file;
warnings.sort((a, b) => a.sortKey - b.sortKey);
const many = warnings.length > 1;
const message =
  `⚠ Severity check (warning only): ${name} uses ${warnings.length} severity value${many ? 's' : ''} ` +
  `that ${many ? "don't" : "doesn't"} match CLAUDE.md (Critical / Major / Minor / Trivial):\n` +
  warnings.map((w) => `  - ${w.text}`).join('\n') +
  `\n  (high / medium / low are fine for a bug's priority; only severity is checked.)`;

process.stdout.write(JSON.stringify({
  systemMessage: message,
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
}));
NODE
exit 0
