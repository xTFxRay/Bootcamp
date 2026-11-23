#!/usr/bin/env bash
# PostToolUse hook (Bash): after Claude writes a test run result row, i.e. a command that sends
# PATCH /api/test-runs/<run>/results/<result>, recompute the flaky-test leaderboard and post the
# Discord alert if a new flake appeared.
#
# It calls the app's POST /api/flaky/recompute, which flags new flakes, sends each one's alert once
# (the app remembers which flakes were already alerted, so a flake the app itself just alerted isn't
# sent twice) and retries alerts that failed before. Only warns; never blocks.
set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only commands that write a run result.
printf '%s' "$cmd" | grep -qE 'test-runs/[0-9]+/results/[0-9]+' || exit 0
printf '%s' "$cmd" | grep -qiE '(-X|--request)[ =]*["'"'"']?PATCH' || exit 0

# The app the command talked to (local by default).
app=$(printf '%s' "$cmd" | grep -oE 'https?://[A-Za-z0-9.:-]+/api/test-runs' | head -1 | sed 's#/api/test-runs##')
app=${app:-http://localhost:5173}
case "$app" in
  http://localhost:*|http://127.0.0.1:*|https://bootcamp-app-a2hk.onrender.com) ;;
  *) exit 0 ;;   # never send the token anywhere else
esac

# The write token, from the project's .env, never printed.
envfile="${CLAUDE_PROJECT_DIR:-$PWD}/.env"
token=$(sed -n 's/^FLAKY_WRITE_TOKEN=//p' "$envfile" 2>/dev/null | head -1)

body=$(curl -s --max-time 25 -X POST "$app/api/flaky/recompute" -H "X-Write-Token: $token")
if ! printf '%s' "$body" | jq -e '.success == true' >/dev/null 2>&1; then
  err=$(printf '%s' "$body" | jq -r '.error // empty' 2>/dev/null)
  [ -z "$err" ] && err="the app didn't answer at $app"
  jq -n --arg m "Flaky check after the result was recorded didn't run: $err." '{systemMessage: $m}'
  exit 0
fi

msg=$(printf '%s' "$body" | jq -r '
  def clean: sub("[.]+$"; "");
  .data as $d
  | ($d.newFlakes | map("New flaky test: \(.title) (\(.score)%). Discord alert \(if .alert.ok then "sent" else "NOT sent: \(.alert.error | clean)" end).")) as $new
  | ($d.retried | map("Retried the Discord alert for \(.title): \(if .alert.ok then "sent" else "still not sent: \(.alert.error | clean)" end).")) as $retry
  | "Flaky leaderboard recomputed: \($d.summary.flaky) flaky test(s)"
    + (if ($new | length) == 0 and ($retry | length) == 0 then ", no new flakes." else ". " + (($new + $retry) | join(" ")) end)')

# The PATCH reply says if the app itself just found (and alerted) a new flake.
already=$(printf '%s' "$input" | jq -r '.tool_response.stdout // .tool_response // empty' 2>/dev/null \
  | grep -oE '"newFlake":\{"title":"[^"]*"' | sed 's/.*"title":"//; s/"$//' | head -1)
[ -n "$already" ] && msg="$msg (\"$already\" turned flaky with this result; the app sent its Discord alert when the result was saved.)"

jq -n --arg m "$msg" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
exit 0
