#!/usr/bin/env bash
# PostToolUse hook (Bash): after Claude Code makes a git commit, check the running app is still up.
#
# "Up" means all of these work (each retried a few times, to allow for the dev servers reloading):
#   1. the page:          GET http://localhost:5173/            -> 200 with the React root element
#   2. the server:        GET http://localhost:5173/api/health  -> {"success": true}
#   3. the React code:    every file in client/src compiles (Vite answers 200 for each module)
#
# If it's DOWN: a warning is shown here, and a message goes to Discord through the
# DISCORD_WEBHOOK_URL in .env (never printed). When it comes back UP after being down, Discord
# gets a "back up" message. If the app isn't running at all, it can't be judged, so you only
# get a local note (no Discord message).
#
# It never blocks anything. Settings you can change with environment variables:
#   PAGE_URL (default http://localhost:5173), PAGE_CHECK_FORCE=1 (check even without a new commit),
#   PAGE_CHECK_LABEL (text put in front of the Discord message, e.g. "[test]").

input="$(cat)"

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
# Only for commands that make a commit (git commit, git -C dir commit, inside && chains...).
printf '%s' "$command" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit\b' || exit 0

project="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

HOOK_PROJECT="$project" \
HOOK_GIT_DIR="$(git rev-parse --absolute-git-dir)" \
HOOK_HEAD="$(git rev-parse --short HEAD 2>/dev/null)" \
HOOK_SUBJECT="$(git log -1 --format=%s 2>/dev/null)" \
node - <<'NODE'
const fs = require('fs');
const path = require('path');

const project = process.env.HOOK_PROJECT;
const head = process.env.HOOK_HEAD || '';
const subject = process.env.HOOK_SUBJECT || '';
const base = (process.env.PAGE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const label = process.env.PAGE_CHECK_LABEL ? `${process.env.PAGE_CHECK_LABEL} ` : '';

// Remembers the last commit checked and whether the app was up, inside .git (never committed).
const stateFile = path.join(process.env.HOOK_GIT_DIR, 'bootcamp-page-check.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}

// The command didn't make a new commit (e.g. "nothing to commit"): nothing to do.
if (!process.env.PAGE_CHECK_FORCE && head && state.lastCommit === head) process.exit(0);

const say = (message) => {
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
  }));
};
const saveState = (status) => {
  try { fs.writeFileSync(stateFile, JSON.stringify({ lastCommit: head, status, checkedAt: new Date().toISOString() })); } catch {}
};

async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    return { error: err.cause?.code || err.name || 'network error' };
  }
}

// All .js/.jsx files under client/src, as the paths Vite serves them at.
function clientModules() {
  const root = path.join(project, 'client', 'src');
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) found.push('/src/' + path.relative(root, full).split(path.sep).join('/'));
    }
  };
  try { walk(root); } catch {}
  return found;
}

async function checkOnce() {
  const problems = [];
  const page = await get(`${base}/`);
  if (page.error) return { notRunning: true, problems: [`nothing answers at ${base} (${page.error})`] };
  if (page.status !== 200 || !page.text.includes('id="root"')) problems.push(`the page answered HTTP ${page.status}`);

  const health = await get(`${base}/api/health`);
  let healthy = false;
  try { healthy = !health.error && health.status === 200 && JSON.parse(health.text).success === true; } catch {}
  if (!healthy) problems.push(`the server's health check failed (${health.error || `HTTP ${health.status}`})`);

  const broken = [];
  for (const mod of clientModules()) {
    const r = await get(`${base}${mod}`);
    if (r.error || r.status !== 200) broken.push(`${mod.replace('/src/', 'client/src/')} (${r.error || `HTTP ${r.status}`})`);
  }
  if (broken.length) problems.push(`React code doesn't compile: ${broken.join(', ')}`);
  return { notRunning: false, problems };
}

async function postToDiscord(content) {
  // Read only the one variable from .env; the URL is never printed.
  let url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    try {
      const line = fs.readFileSync(path.join(project, '.env'), 'utf8').split('\n').find((l) => l.startsWith('DISCORD_WEBHOOK_URL='));
      url = line?.slice('DISCORD_WEBHOOK_URL='.length).trim();
    } catch {}
  }
  if (!url) return 'not sent: DISCORD_WEBHOOK_URL is not set in .env';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Bootcamp App', content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? 'sent to Discord' : `not sent: Discord answered HTTP ${res.status}`;
  } catch {
    return 'not sent: could not reach Discord';
  }
}

(async () => {
  // Retry, so a dev server that is still reloading after the change isn't reported as down.
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    result = await checkOnce();
    if (!result.notRunning && result.problems.length === 0) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  const commit = head ? `commit ${head} "${subject}"` : 'the last commit';

  if (result.notRunning) {
    saveState('not-running');
    say(`ℹ Page check after ${commit}: the app isn't running at ${base}, so I couldn't check it. Start it with npm run dev. (No Discord message for this.)`);
    return;
  }

  if (result.problems.length) {
    const discord = await postToDiscord(
      `${label}🔴 **Bootcamp App is down** after ${commit}\n` + result.problems.map((p) => `• ${p}`).join('\n') + `\n${base}`
    );
    saveState('down');
    say(
      `🔴 Page check after ${commit}: the app is DOWN.\n` +
        result.problems.map((p) => `  - ${p}`).join('\n') +
        `\n  Discord alert: ${discord}.`
    );
    return;
  }

  // Up. Tell Discord only if the last check found it down.
  if (state.status === 'down') {
    const discord = await postToDiscord(`${label}🟢 **Bootcamp App is back up** after ${commit}\n${base}`);
    say(`🟢 Page check after ${commit}: the app is back up. Discord: ${discord}.`);
  }
  saveState('up');
})();
NODE
exit 0
