#!/usr/bin/env bash
# SubagentStop hook: the flake-analyzer agent can't finish while a top-10 flaky test on the app's
# /flaky page has no root-cause hypothesis, or one written before its newest results.
#
# - Other agents: passes straight through.
# - App not running: lets the agent stop, with a warning.
# - Missing or out-of-date hypotheses: blocks the stop once and names them, so the agent keeps going.
#   If it tries to stop again with rows still missing (stop_hook_active), it's allowed, with a warning,
#   so it can never loop forever.
set -u

input=$(cat)
agent=$(printf '%s' "$input" | jq -r '.agent_type // .subagent_type // empty' 2>/dev/null)
# Fallback when the agent type isn't in the input: look for the agent's name in its transcript.
if [ -z "$agent" ]; then
  transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // empty' 2>/dev/null)
  if [ -n "$transcript" ] && [ -f "$transcript" ] && head -c 20000 "$transcript" | grep -q 'flake-analyzer'; then
    agent=flake-analyzer
  fi
fi
case "$agent" in
  *flake-analyzer) ;;
  *) exit 0 ;;
esac

again=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)
# Check the app the agent worked on: the deployed copy if its transcript used that address,
# otherwise the local app (or FLAKY_APP_URL when set).
app="${FLAKY_APP_URL:-http://localhost:5173}"
transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // empty' 2>/dev/null)
if [ -z "${FLAKY_APP_URL:-}" ] && [ -n "$transcript" ] && [ -f "$transcript" ] && grep -q 'bootcamp-app-a2hk.onrender.com/api/flaky' "$transcript"; then
  app="https://bootcamp-app-a2hk.onrender.com"
fi
url="$app/api/flaky"

if ! body=$(curl -s --max-time 12 "$url") || ! printf '%s' "$body" | jq -e '.success == true' >/dev/null 2>&1; then
  jq -n --arg m "flake-analyzer check skipped: the app didn't answer at $url." '{systemMessage: $m}'
  exit 0
fi

todo=$(printf '%s' "$body" | jq -r '.data.top[] | select(.hypothesis == null or .hypothesis.outdated) |
  "#\(.rank) \(.title) (test case \(.testCaseId)): \(if .hypothesis == null then "no hypothesis" else "out of date" end)"')
total=$(printf '%s' "$body" | jq '.data.top | length')

if [ -z "$todo" ]; then
  jq -n --arg m "flake-analyzer: all $total flaky tests on $app/flaky have a current root-cause hypothesis." '{systemMessage: $m}'
  exit 0
fi

count=$(printf '%s\n' "$todo" | grep -c .)
if [ "$again" = "true" ]; then
  jq -n --arg m "flake-analyzer stopped with $count of $total flaky tests still missing a current hypothesis:
$todo" '{systemMessage: $m}'
  exit 0
fi

jq -n --arg r "Not finished: $count of the $total flaky tests on $app/flaky still need a current root-cause hypothesis. Read the evidence and save a hypothesis for each of these, then stop:
$todo" '{decision: "block", reason: $r}'
exit 0
